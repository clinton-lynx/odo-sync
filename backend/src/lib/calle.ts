import { CalleClient } from "@call-e/calle";
import type { Call, CreateCallInput } from "@call-e/calle";
import { CallOutcome, CallStage, type Vehicle } from "@prisma/client";
import {
  getWorkshopInfo,
  type WorkshopInfo,
} from "./workshop.js";

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
  calleCallId: string | null;
  providerCallId: string | null;
  providerAttemptStatus: string | null;
  providerFailureCode: string | null;
  providerFailureMessage: string | null;
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
export function formatCallTask(
  vehicle: Vehicle,
  stage: CallStage,
  workshop: WorkshopInfo,
  now: Date = new Date(),
): string {
  const todayStr = now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const who = vehicle.ownerName;
  const car = `${vehicle.makeModel} (reg ${vehicle.regnNo})`;
  const introParts = [
    `You are calling ${who} on behalf of ${workshop.businessName} about their ${car}.`,
    `Start the call by politely confirming you're speaking with ${who} — for example, "Hi, is this ${who}?" Do not guess a title or honorific; just use their name as given. Only continue with the reminder once you've confirmed you're speaking with the right person; if not, politely ask if you can leave a message or call back later.`,
  ];
  if (workshop.address) {
    introParts.push(`The workshop is located at ${workshop.address}.`);
  }
  if (workshop.serviceDescription) {
    const description = workshop.serviceDescription
      .replace(/[.!?]+$/, "")
      .replace(/^Includes\b/, "includes");
    introParts.push(`A routine service ${description}.`);
  }
  if (workshop.operatingHours) {
    introParts.push(`The workshop is open ${workshop.operatingHours}.`);
  }
  if (workshop.phoneNumber) {
    introParts.push(`The workshop callback number is ${workshop.phoneNumber}.`);
  }
  introParts.push(`Today's date is ${todayStr}.`);
  const intro = introParts.join(" ");
  const bookingNote =
    "If they want to book, ask what appointment date and time works for them and record what they propose.";

  switch (stage) {
    case CallStage.FIFTEEN_DAY:
      return [
        intro,
        `Their next scheduled service is due in about ${STAGE_LABEL[stage]}.`,
        `Give a friendly heads-up that it's coming up and ask whether they'd like to book now or be reminded closer to the date.`,
        bookingNote,
      ].join(" ");
    case CallStage.TEN_DAY:
      return [
        intro,
        `Their service is due in about ${STAGE_LABEL[stage]}.`,
        `Encourage them to lock in an appointment now and try to agree a specific date.`,
        bookingNote,
      ].join(" ");
    case CallStage.FIVE_DAY:
      return [
        intro,
        `Their service is due in only ${STAGE_LABEL[stage]} — this is the final reminder.`,
        `Stress that slots are filling up and try hard to book a firm appointment date before the due date.`,
        bookingNote,
      ].join(" ");
  }
}

/** Build a call task from the latest database-backed workshop settings. */
export async function buildCallTask(
  vehicle: Vehicle,
  stage: CallStage,
  now: Date = new Date(),
): Promise<string> {
  return formatCallTask(vehicle, stage, await getWorkshopInfo(), now);
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
      type: "string",
      description:
        "ISO 8601 date/time of the agreed appointment. Omit when no date was agreed.",
    },
    notes: {
      type: "string",
      description:
        "Short free-text summary of anything relevant from the call. Omit when empty.",
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
  const attempt = call.recipients?.[0]?.attempts?.[0];

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
    calleCallId: call.id,
    providerCallId: attempt?.providerCallId ?? null,
    providerAttemptStatus: attempt?.status ?? null,
    providerFailureCode: attempt?.failureCode ?? call.failureCode ?? null,
    providerFailureMessage:
      attempt?.failureMessage ?? call.failureMessage ?? null,
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
    calleCallId: null,
    providerCallId: null,
    providerAttemptStatus: null,
    providerFailureCode: null,
    providerFailureMessage: null,
    dryRun: true,
  };
}

/** Convert Nigerian local numbers to the E.164 format required by CALL-E. */
export function normalizeCallPhoneNumber(phoneNumber: string): string {
  const compact = phoneNumber.trim().replace(/[\s().-]/g, "");

  if (/^0\d{10}$/.test(compact)) {
    return `+234${compact.slice(1)}`;
  }
  if (/^234\d{10}$/.test(compact)) {
    return `+${compact}`;
  }
  if (/^00234\d{10}$/.test(compact)) {
    return `+${compact.slice(2)}`;
  }

  return compact;
}

/** Build the canonical CALL-E recipient list from a stored phone number. */
export function buildCallRecipients(
  phoneNumber: string,
): NonNullable<CreateCallInput["recipients"]> {
  const normalizedPhoneNumber = normalizeCallPhoneNumber(phoneNumber);

  return [
    {
      phones: [normalizedPhoneNumber],
      ...(normalizedPhoneNumber.startsWith("+234")
        ? { region: "NG", locale: "en-NG" }
        : {}),
    },
  ];
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
  const task = await buildCallTask(vehicle, stage);
  const callInput: CreateCallInput = {
    task,
    recipients: buildCallRecipients(vehicle.phoneNumber),
    resultSchema: RESULT_SCHEMA,
    metadata: { regnNo: vehicle.regnNo, stage },
  };

  if (!client) {
    console.log(
      `[calle] DRY-RUN — CALL-E payload:\n${JSON.stringify(callInput, null, 2)}`,
    );
    return simulateCall(vehicle, stage);
  }

  const call = await client.calls.createAndWait(
    callInput,
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  const attempt = call.recipients?.[0]?.attempts?.[0];
  console.log(
    `[calle] call=${call.id} status=${call.status} ` +
      `attempt=${attempt?.status ?? "none"} providerCall=${attempt?.providerCallId ?? "none"} ` +
      `failure=${attempt?.failureCode ?? call.failureCode ?? "none"}`,
  );

  return normalizeCall(call);
}
