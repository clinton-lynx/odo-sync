import { CallJobStatus, CallStage, CallWindow, type CallJob } from "@prisma/client";
import { prisma } from "./prisma.js";
import { placeServiceReminderCall } from "./calle.js";

/**
 * Scheduling logic: when a service is due, and when each reminder call fires.
 *
 * A vehicle's next service is due SERVICE_INTERVAL_DAYS after its last service.
 * We place three reminder calls ahead of that due date — 15, 10 and 5 days out.
 */

export const SERVICE_INTERVAL_DAYS = Number(
  process.env.SERVICE_INTERVAL_DAYS ?? 180,
);

/** How many days before the due date each stage fires. */
export const STAGE_OFFSET_DAYS: Record<CallStage, number> = {
  [CallStage.FIFTEEN_DAY]: 15,
  [CallStage.TEN_DAY]: 10,
  [CallStage.FIVE_DAY]: 5,
};

export const ALL_STAGES: CallStage[] = [
  CallStage.FIFTEEN_DAY,
  CallStage.TEN_DAY,
  CallStage.FIVE_DAY,
];

/** Business hours for each preferred call window (local time), [startHour, endHour). */
export const WINDOW_HOURS: Record<CallWindow, [number, number]> = {
  [CallWindow.MORNING]: [8, 12],
  [CallWindow.AFTERNOON]: [12, 17],
  [CallWindow.EVENING]: [17, 20],
};

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** The next service due date for a vehicle, given its last service date. */
export function computeNextDueDate(
  lastServiceDate: Date,
  intervalDays: number = SERVICE_INTERVAL_DAYS,
): Date {
  return addDays(lastServiceDate, intervalDays);
}

/** When a given stage's reminder call should fire, given the due date. */
export function stageFireDate(dueDate: Date, stage: CallStage): Date {
  return addDays(dueDate, -STAGE_OFFSET_DAYS[stage]);
}

/** True if `now` falls inside the given preferred window's business hours. */
export function isWithinWindow(window: CallWindow, now: Date = new Date()): boolean {
  const [start, end] = WINDOW_HOURS[window];
  const hour = now.getHours();
  return hour >= start && hour < end;
}

export interface CreateCallJobsResult {
  dueDate: Date;
  jobs: CallJob[];
}

/**
 * Create the three staged CallJobs (15/10/5-day) for a vehicle's next service.
 * Called at close-out. Existing PENDING jobs for the vehicle are cancelled first
 * so re-running close-out doesn't create duplicates.
 */
export async function createCallJobsForVehicle(
  vehicleRegnNo: string,
  opts: { cancelExistingPending?: boolean } = {},
): Promise<CreateCallJobsResult> {
  const vehicle = await prisma.vehicle.findUniqueOrThrow({
    where: { regnNo: vehicleRegnNo },
  });
  const dueDate = computeNextDueDate(vehicle.lastServiceDate);

  const jobs = await prisma.$transaction(async (tx) => {
    if (opts.cancelExistingPending ?? true) {
      await tx.callJob.updateMany({
        where: { vehicleRegnNo, status: CallJobStatus.PENDING },
        data: { status: CallJobStatus.CANCELLED },
      });
    }
    return Promise.all(
      ALL_STAGES.map((stage) =>
        tx.callJob.create({
          data: {
            vehicleRegnNo,
            stage,
            scheduledFireDate: stageFireDate(dueDate, stage),
            preferredWindow: vehicle.preferredWindow,
          },
        }),
      ),
    );
  });

  return { dueDate, jobs };
}

export interface FireOptions {
  /** Treat this instant as "now" (defaults to the real clock). */
  now?: Date;
  /** Only fire jobs whose preferred window matches `now`. Defaults to true. */
  respectWindow?: boolean;
  /** Restrict to a single vehicle (handy for demos/tests). */
  regnNo?: string;
  /** Cap how many jobs to fire in one pass. */
  limit?: number;
}

export interface FiredJobSummary {
  jobId: string;
  regnNo: string;
  stage: CallStage;
  outcome: string;
  dryRun: boolean;
}

export interface FireSummary {
  checked: number;
  fired: number;
  skippedWindow: number;
  failed: number;
  results: FiredJobSummary[];
}

/**
 * Fire all due PENDING CallJobs: place (or simulate) the reminder call, persist
 * a CallResult, and mark the job FIRED. This is the internal entry point the
 * cron scheduler calls directly — no HTTP round-trip to ourselves.
 */
export async function fireDueCallJobs(
  options: FireOptions = {},
): Promise<FireSummary> {
  const now = options.now ?? new Date();
  const respectWindow = options.respectWindow ?? true;

  const due = await prisma.callJob.findMany({
    where: {
      status: CallJobStatus.PENDING,
      scheduledFireDate: { lte: now },
      ...(options.regnNo ? { vehicleRegnNo: options.regnNo } : {}),
    },
    include: { vehicle: true },
    orderBy: { scheduledFireDate: "asc" },
    ...(options.limit ? { take: options.limit } : {}),
  });

  const summary: FireSummary = {
    checked: due.length,
    fired: 0,
    skippedWindow: 0,
    failed: 0,
    results: [],
  };

  for (const job of due) {
    if (respectWindow && !isWithinWindow(job.preferredWindow, now)) {
      summary.skippedWindow++;
      continue;
    }
    try {
      const result = await placeServiceReminderCall({
        vehicle: job.vehicle,
        stage: job.stage,
        idempotencyKey: job.id,
      });

      // Call happens outside the DB transaction; only the writes are atomic.
      await prisma.$transaction([
        prisma.callResult.create({
          data: {
            callJobId: job.id,
            outcome: result.outcome,
            proposedAppointmentDate: result.proposedAppointmentDate,
            notes: result.notes,
          },
        }),
        prisma.callJob.update({
          where: { id: job.id },
          data: { status: CallJobStatus.FIRED },
        }),
      ]);

      summary.fired++;
      summary.results.push({
        jobId: job.id,
        regnNo: job.vehicleRegnNo,
        stage: job.stage,
        outcome: result.outcome,
        dryRun: result.dryRun,
      });
    } catch (err) {
      summary.failed++;
      console.error(`[scheduler] failed to fire job ${job.id}:`, err);
    }
  }

  return summary;
}
