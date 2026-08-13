import type { ReactNode } from "react";
import type { CallJobStatus, CallOutcome } from "@/lib/api";
import { outcomeBadge, statusLabel } from "@/lib/format";

/**
 * Status vocabulary mirrors the data model. Colour encodes state only:
 *   green  → positive (BOOKED)
 *   amber  → action-needed (NO_ANSWER, CALLBACK_REQUESTED)
 *   muted  → neutral (everything else)
 * Never more than one accent per badge.
 */
export type Tone = "good" | "warn" | "muted";

const TONE_CLASS: Record<Tone, string> = {
  good: "text-good border-good/30 bg-good/10",
  warn: "text-warn border-warn/30 bg-warn/10",
  muted: "text-muted border-line bg-ink/[0.05]",
};

const OUTCOME_TONE: Record<CallOutcome, Tone> = {
  BOOKED: "good",
  NO_ANSWER: "warn",
  CALLBACK_REQUESTED: "warn",
  DECLINED: "muted",
};

const STATUS_TONE: Record<CallJobStatus, Tone> = {
  PENDING: "muted",
  FIRED: "muted",
  CANCELLED: "muted",
};

/** Generic pill — small, uppercase, letter-spaced. */
export function Pill({
  children,
  tone = "muted",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Status/outcome badge. Pass exactly one of `outcome` or `status`. */
export function StatusBadge({
  outcome,
  status,
  className = "",
}: {
  outcome?: CallOutcome;
  status?: CallJobStatus;
  className?: string;
}) {
  if (outcome) {
    return (
      <Pill tone={OUTCOME_TONE[outcome]} className={className}>
        {outcomeBadge(outcome)}
      </Pill>
    );
  }
  if (status) {
    return (
      <Pill tone={STATUS_TONE[status]} className={className}>
        {statusLabel(status)}
      </Pill>
    );
  }
  return null;
}

export default StatusBadge;
