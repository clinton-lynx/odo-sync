import { CalleClient } from "@call-e/calle";
import type { Call, CreateCallInput } from "@call-e/calle";
import { CallOutcome, CallStage, type Vehicle } from "@prisma/client";

/**
 * CALL-E client wrapper + per-stage call scripts.
 *
 * The real SDK (`@call-e/calle`) can place actual outbound phone calls, so this
 * module only does that when CALLE_API_KEY is set. With no key it runs in
 * DRY-RUN mode: it builds the exact same task/schema payload and logs it, then
 * returns a simulated result. That keeps the whole scaffold runnable (and the
 * scheduler exercisable) without dialing real numbers or needing credentials.
 */

const apiKey = process.env.CALLE_API_KEY?.trim();
const baseUrl = process.env.CALLE_BASE_URL?.trim() || undefined;

// Instantiate the real client only when configured.
const client: CalleClient | null = apiKey
  ? new CalleClient({ apiKey, baseUrl })
  : null;

export function isCalleConfigured(): boolean {
  return client !== null;
}

/** Normalized result we persist to CallResult, regardless of dry-run vs live. */
export interface NormalizedCallResult {
  outcome: CallOutcome;
  proposedAppointmentDate: Date | null;
  notes: string | null;
  providerCallId: string | null;
  dryRun: boolean;
}

const STAGE_LABEL: Record<CallStage, string> = {
  [CallStage.FIFTEEN_DAY]: "15 days",
  [CallStage.TEN_DAY]: "10 days",
  [CallStage.FIVE_DAY]: "5 days",
};

/**
 * Per-stage call script. The 15-day call is a soft heads-up, the 10-day call
 * pushes to pick a slot, and the 5-day call is the final urgent reminder.
 */
export function buildCallTask(vehicle: Vehicle, stage: CallStage): string {
  const window = vehicle.preferredWindow.toLowerCase();
  const who = vehicle.ownerName;
  const car = `${vehicle.makeModel} (reg ${vehicle.regnNo})`;
  const intro = `You are calling ${who} on behalf of the OdoSync service centre about their ${car}.`;
  const windowNote = `If they want to book, offer appointment slots in the ${window}, matching their preferred call window.`;

  switch (stage) {
    case CallStage.FIFTEEN_DAY:
      return [
        intro,
        `Their next scheduled service is due in about ${STAGE_LABEL[stage]}.`,
        `Give a friendly heads-up that it's coming up and ask whether they'd like to book now or be reminded closer to the date.`,
        windowNote,
      ].join(" ");
    case CallStage.TEN_DAY:
      return [
        intro,
        `Their service is due in about ${STAGE_LABEL[stage]}.`,
        `Encourage them to lock in an appointment now and try to agree a specific date.`,
        windowNote,
      ].join(" ");
    case CallStage.FIVE_DAY:
      return [
        intro,
        `Their service is due in only ${STAGE_LABEL[stage]} — this is the final reminder.`,
        `Stress that slots are filling up and try hard to book a firm appointment date before the due date.`,
        windowNote,
      ].join(" ");
  }
}

/**
 * JSON Schema describing the structured result we want CALL-E to extract from
 * the conversation. Maps 1:1 to our CallResult / CallOutcome model.
 */
const RESULT_SCHEMA: NonNullable<CreateCallInput["resultSchema"]> = {
  type: "object",
  required: ["outcome"],
  properties: {
    outcome: {
      type: "string",
      enum: ["BOOKED", "DECLINED", "CALLBACK_REQUESTED", "NO_ANSWER"],
      description:
        "BOOKED if an appointment date was agreed; DECLINED if they refused; " +
        "CALLBACK_REQUESTED if they asked to be called later; NO_ANSWER if nobody answered.",
    },
    proposedAppointmentDate: {
      type: ["string", "null"],
      description: "ISO 8601 date/time of the agreed appointment, or null.",
    },
    notes: {
      type: ["string", "null"],
      description: "Short free-text summary of anything relevant from the call.",
    },
  },
};

function coerceOutcome(value: unknown): CallOutcome {
  if (typeof value === "string" && value in CallOutcome) {
    return CallOutcome[value as keyof typeof CallOutcome];
  }
  return CallOutcome.NO_ANSWER;
}

function coerceDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Map the CALL-E Call object onto our normalized result. */
function normalizeCall(call: Call): NormalizedCallResult {
  const structured = (call.structuredResult ?? {}) as Record<string, unknown>;
  const providerCallId =
    call.recipients?.[0]?.attempts?.[0]?.providerCallId ?? call.id;

  // If the task didn't complete (e.g. line never connected), treat as NO_ANSWER
  // unless CALL-E explicitly extracted a different outcome.
  const outcome =
    "outcome" in structured
      ? coerceOutcome(structured.outcome)
      : call.taskCompleted
        ? CallOutcome.CALLBACK_REQUESTED
        : CallOutcome.NO_ANSWER;

  return {
    outcome,
    proposedAppointmentDate: coerceDate(structured.proposedAppointmentDate),
    notes:
      (typeof structured.notes === "string" ? structured.notes : null) ??
      call.summary ??
      null,
    providerCallId,
    dryRun: false,
  };
}

/**
 * Simulated outcome for DRY-RUN mode (no API key). Deterministic per vehicle so
 * demos are reproducible: proposes an appointment a few days out and books it.
 */
function simulateCall(vehicle: Vehicle, stage: CallStage): NormalizedCallResult {
  const offsetDays = stage === CallStage.FIVE_DAY ? 3 : 7;
  const proposed = new Date();
  proposed.setDate(proposed.getDate() + offsetDays);
  return {
    outcome: CallOutcome.BOOKED,
    proposedAppointmentDate: proposed,
    notes: `[DRY-RUN] Simulated ${STAGE_LABEL[stage]} reminder for ${vehicle.ownerName}. No real call placed (CALLE_API_KEY not set).`,
    providerCallId: null,
    dryRun: true,
  };
}

export interface PlaceCallArgs {
  vehicle: Vehicle;
  stage: CallStage;
  /** Optional idempotency key so retries don't double-dial. */
  idempotencyKey?: string;
}

/**
 * Place (or simulate) a service-reminder call for a given vehicle + stage,
 * and return a normalized result ready to persist as a CallResult.
 */
export async function placeServiceReminderCall({
  vehicle,
  stage,
  idempotencyKey,
}: PlaceCallArgs): Promise<NormalizedCallResult> {
  const task = buildCallTask(vehicle, stage);

  if (!client) {
    console.log(
      `[calle] DRY-RUN — would call ${vehicle.phoneNumber} (${vehicle.ownerName}) | stage=${stage}\n        task: ${task}`,
    );
    return simulateCall(vehicle, stage);
  }

  const call = await client.calls.createAndWait(
    {
      task,
      recipient: { phone: vehicle.phoneNumber },
      resultSchema: RESULT_SCHEMA,
      metadata: { regnNo: vehicle.regnNo, stage },
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  return normalizeCall(call);
}
