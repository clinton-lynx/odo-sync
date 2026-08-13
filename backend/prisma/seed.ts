import "dotenv/config";
import {
  CallJobStatus,
  CallOutcome,
  CallWindow,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import {
  ALL_STAGES,
  SERVICE_INTERVAL_DAYS,
  addDays,
  createCallJobsForVehicle,
  stageFireDate,
  computeNextDueDate,
} from "../src/lib/scheduling.js";

/**
 * Seeds demo fleet vehicles spread across the 15/10/5-day reminder windows.
 *
 * For each vehicle we set `lastServiceDate` so its next service is due in
 * `dueInDays`, then generate the real 15/10/5-day CallJobs via the scheduling
 * logic. Any stage whose fire date has already elapsed is backfilled as a FIRED
 * job with a simulated CallResult — so the dashboard shows a realistic mix of
 * completed calls and a pending call that's due right now.
 */

interface DemoVehicle {
  regnNo: string;
  makeModel: string;
  ownerName: string;
  phoneNumber: string; // E.164
  company?: string;
  department?: string;
  lastServiceMileage?: number;
  preferredWindow: CallWindow;
  /** Days until the next service is due (drives which stage is due "today"). */
  dueInDays: number;
}

const DEMO_VEHICLES: DemoVehicle[] = [
  // ---- Due in ~15 days → FIFTEEN_DAY call due today ----
  {
    regnNo: "KA01AB1234",
    makeModel: "Toyota Camry",
    ownerName: "Priya Sharma",
    phoneNumber: "+919876543210",
    company: "Acme Logistics",
    department: "Sales Fleet",
    lastServiceMileage: 42000,
    preferredWindow: CallWindow.MORNING,
    dueInDays: 15,
  },
  {
    regnNo: "KA05CD5678",
    makeModel: "Honda City",
    ownerName: "Rahul Verma",
    phoneNumber: "+919812345678",
    company: "Acme Logistics",
    department: "Operations",
    lastServiceMileage: 31500,
    preferredWindow: CallWindow.AFTERNOON,
    dueInDays: 15,
  },
  // ---- Due in ~10 days → TEN_DAY call due today ----
  {
    regnNo: "MH12EF9012",
    makeModel: "Hyundai Creta",
    ownerName: "Anjali Menon",
    phoneNumber: "+919900112233",
    company: "Blue Ridge Foods",
    department: "Distribution",
    lastServiceMileage: 58200,
    preferredWindow: CallWindow.MORNING,
    dueInDays: 10,
  },
  {
    regnNo: "MH14GH3456",
    makeModel: "Maruti Suzuki Swift",
    ownerName: "Vikram Iyer",
    phoneNumber: "+919000998877",
    company: "Blue Ridge Foods",
    department: "Last Mile",
    lastServiceMileage: 27700,
    preferredWindow: CallWindow.EVENING,
    dueInDays: 10,
  },
  // ---- Due in ~5 days → FIVE_DAY call due today ----
  {
    regnNo: "DL03IJ7890",
    makeModel: "Tata Nexon",
    ownerName: "Sneha Kapoor",
    phoneNumber: "+919345678901",
    company: "Metro Couriers",
    department: "City Fleet",
    lastServiceMileage: 63400,
    preferredWindow: CallWindow.AFTERNOON,
    dueInDays: 5,
  },
  {
    regnNo: "DL08KL2345",
    makeModel: "Kia Seltos",
    ownerName: "Arjun Nair",
    phoneNumber: "+919456789012",
    company: "Metro Couriers",
    department: "Intercity",
    lastServiceMileage: 19800,
    preferredWindow: CallWindow.MORNING,
    dueInDays: 5,
  },
  // ---- Not yet in the reminder window (all jobs future/pending) ----
  {
    regnNo: "TN22MN6789",
    makeModel: "Volkswagen Virtus",
    ownerName: "Deepa Rao",
    phoneNumber: "+919567890123",
    company: "Coastal Traders",
    department: "Admin",
    lastServiceMileage: 8100,
    preferredWindow: CallWindow.EVENING,
    dueInDays: 45,
  },
];

/** Deterministic simulated outcome for backfilled (already-elapsed) calls. */
function simulatedOutcome(index: number): {
  outcome: CallOutcome;
  booked: boolean;
} {
  const cycle: CallOutcome[] = [
    CallOutcome.NO_ANSWER,
    CallOutcome.CALLBACK_REQUESTED,
    CallOutcome.BOOKED,
    CallOutcome.DECLINED,
  ];
  const outcome = cycle[index % cycle.length]!;
  return { outcome, booked: outcome === CallOutcome.BOOKED };
}

async function main(): Promise<void> {
  console.log("Resetting demo data...");
  await prisma.callResult.deleteMany();
  await prisma.callJob.deleteMany();
  await prisma.vehicle.deleteMany();

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  let backfillIndex = 0;

  for (const v of DEMO_VEHICLES) {
    // lastServiceDate chosen so the next service is due in `dueInDays`.
    const lastServiceDate = addDays(now, v.dueInDays - SERVICE_INTERVAL_DAYS);

    await prisma.vehicle.create({
      data: {
        regnNo: v.regnNo,
        makeModel: v.makeModel,
        ownerName: v.ownerName,
        phoneNumber: v.phoneNumber,
        company: v.company ?? null,
        department: v.department ?? null,
        lastServiceDate,
        lastServiceMileage: v.lastServiceMileage ?? null,
        preferredWindow: v.preferredWindow,
      },
    });

    // Generate the real 15/10/5-day jobs off the computed due date.
    await createCallJobsForVehicle(v.regnNo);

    const dueDate = computeNextDueDate(lastServiceDate);

    // Backfill any stage whose fire date is already in the past as FIRED.
    for (const stage of ALL_STAGES) {
      const fireDate = stageFireDate(dueDate, stage);
      if (fireDate < startOfToday) {
        const job = await prisma.callJob.findFirst({
          where: {
            vehicleRegnNo: v.regnNo,
            stage,
            status: CallJobStatus.PENDING,
          },
        });
        if (!job) continue;

        const { outcome, booked } = simulatedOutcome(backfillIndex++);
        await prisma.$transaction([
          prisma.callResult.create({
            data: {
              callJobId: job.id,
              firedAt: fireDate,
              outcome,
              proposedAppointmentDate: booked ? addDays(dueDate, -2) : null,
              notes: `[seed] Simulated ${stage} reminder outcome: ${outcome}.`,
            },
          }),
          prisma.callJob.update({
            where: { id: job.id },
            data: { status: CallJobStatus.FIRED },
          }),
        ]);
      }
    }
  }

  const vehicleCount = await prisma.vehicle.count();
  const pending = await prisma.callJob.count({
    where: { status: CallJobStatus.PENDING },
  });
  const dueNow = await prisma.callJob.count({
    where: {
      status: CallJobStatus.PENDING,
      scheduledFireDate: { lte: endOfToday },
    },
  });
  const fired = await prisma.callJob.count({
    where: { status: CallJobStatus.FIRED },
  });

  console.log(
    `Seeded ${vehicleCount} vehicles | ${pending} pending jobs ` +
      `(${dueNow} due by end of today) | ${fired} already-fired jobs with results.`,
  );
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
