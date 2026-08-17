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
import {
  DEFAULT_WORKSHOP_INFO,
  WORKSHOP_SETTINGS_ID,
} from "../src/lib/workshop.js";

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
    regnNo: "LND-234-KJA",
    makeModel: "Toyota Camry",
    ownerName: "Chinedu Okafor",
    phoneNumber: "+2340000000001",
    company: "Lagos Logistics",
    department: "Sales Fleet",
    lastServiceMileage: 42000,
    preferredWindow: CallWindow.MORNING,
    dueInDays: 15,
  },
  {
    regnNo: "KJA-100-HDJ",
    makeModel: "Honda City",
    ownerName: "Amina Bello",
    phoneNumber: "+2340000000002",
    company: "Lagos Logistics",
    department: "Operations",
    lastServiceMileage: 31500,
    preferredWindow: CallWindow.AFTERNOON,
    dueInDays: 15,
  },
  // ---- Due in ~10 days → TEN_DAY call due today ----
  {
    regnNo: "ABJ-482-KWL",
    makeModel: "Hyundai Creta",
    ownerName: "Tunde Adeyemi",
    phoneNumber: "+2340000000003",
    company: "Abuja Foods",
    department: "Distribution",
    lastServiceMileage: 58200,
    preferredWindow: CallWindow.MORNING,
    dueInDays: 10,
  },
  {
    regnNo: "RSH-315-ABJ",
    makeModel: "Maruti Suzuki Swift",
    ownerName: "Ngozi Eze",
    phoneNumber: "+2340000000004",
    company: "Abuja Foods",
    department: "Last Mile",
    lastServiceMileage: 27700,
    preferredWindow: CallWindow.EVENING,
    dueInDays: 10,
  },
  // ---- Due in ~5 days → FIVE_DAY call due today ----
  {
    regnNo: "PHC-731-RST",
    makeModel: "Tata Nexon",
    ownerName: "Ifeanyi Nwosu",
    phoneNumber: "+2340000000005",
    company: "Port Harcourt Couriers",
    department: "City Fleet",
    lastServiceMileage: 63400,
    preferredWindow: CallWindow.AFTERNOON,
    dueInDays: 5,
  },
  {
    regnNo: "RUM-264-PHC",
    makeModel: "Kia Seltos",
    ownerName: "Zainab Musa",
    phoneNumber: "+2340000000006",
    company: "Port Harcourt Couriers",
    department: "Intercity",
    lastServiceMileage: 19800,
    preferredWindow: CallWindow.MORNING,
    dueInDays: 5,
  },
  // ---- Not yet in the reminder window (all jobs future/pending) ----
  {
    regnNo: "IBD-417-MAP",
    makeModel: "Volkswagen Virtus",
    ownerName: "Kemi Afolayan",
    phoneNumber: "+2340000000007",
    company: "Ibadan Traders",
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

  await prisma.workshopSettings.upsert({
    where: { id: WORKSHOP_SETTINGS_ID },
    update: { ...DEFAULT_WORKSHOP_INFO, phoneNumber: null },
    create: {
      id: WORKSHOP_SETTINGS_ID,
      ...DEFAULT_WORKSHOP_INFO,
      phoneNumber: null,
    },
  });

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
