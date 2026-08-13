/**
 * Presentation helpers. Pure functions, no React — safe to import anywhere.
 * The UI vocabulary deliberately mirrors the data-model vocabulary
 * (CallStage / CallWindow / CallOutcome / CallJobStatus from `@/lib/api`).
 */
import type {
  CallStage,
  CallWindow,
  CallOutcome,
  CallJobStatus,
} from "@/lib/api";

/* ---------- dates ---------- */

const DAY_MS = 86_400_000;

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Whole days from now until `iso` (negative = past). */
export function daysUntil(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.round((then - Date.now()) / DAY_MS);
}

/** "today" / "in 5d" / "3d ago" — compact relative label. */
export function relativeDays(iso: string): string {
  const d = daysUntil(iso);
  if (d === 0) return "today";
  if (d < 0) return `${Math.abs(d)}d ago`;
  return `in ${d}d`;
}

export function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

/* ---------- phone ---------- */

/** Mask a phone for display: keep the country code + last two digits. */
export function maskPhone(phone: string): string {
  const trimmed = (phone ?? "").trim();
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length <= 4) return trimmed || "—";
  const cc = plus ? digits.slice(0, 2) : "";
  const last = digits.slice(-2);
  const hidden = Math.max(4, digits.length - cc.length - 2);
  return `${plus ? `+${cc} ` : ""}${"•".repeat(hidden)} ${last}`;
}

/* ---------- enum labels ---------- */

const STAGE_LABELS: Record<CallStage, string> = {
  FIFTEEN_DAY: "15-day reminder",
  TEN_DAY: "10-day reminder",
  FIVE_DAY: "5-day reminder",
};
export const stageLabel = (s: CallStage): string => STAGE_LABELS[s] ?? s;

const STAGE_SHORT: Record<CallStage, string> = {
  FIFTEEN_DAY: "15-day",
  TEN_DAY: "10-day",
  FIVE_DAY: "5-day",
};
export const stageShort = (s: CallStage): string => STAGE_SHORT[s] ?? s;

/** Days-before-due each stage fires. */
export const STAGE_DAYS: Record<CallStage, number> = {
  FIFTEEN_DAY: 15,
  TEN_DAY: 10,
  FIVE_DAY: 5,
};

const WINDOW_LABELS: Record<CallWindow, string> = {
  MORNING: "Morning",
  AFTERNOON: "Afternoon",
  EVENING: "Evening",
};
export const windowLabel = (w: CallWindow): string => WINDOW_LABELS[w] ?? w;

const WINDOW_HOURS_LABEL: Record<CallWindow, string> = {
  MORNING: "08:00 – 12:00",
  AFTERNOON: "12:00 – 17:00",
  EVENING: "17:00 – 20:00",
};
export const windowHours = (w: CallWindow): string =>
  WINDOW_HOURS_LABEL[w] ?? "";

const OUTCOME_LABELS: Record<CallOutcome, string> = {
  BOOKED: "Booked",
  DECLINED: "Declined",
  CALLBACK_REQUESTED: "Callback requested",
  NO_ANSWER: "No answer",
};
export const outcomeLabel = (o: CallOutcome): string => OUTCOME_LABELS[o] ?? o;

/** Short uppercase state word for badges — mirrors the enum vocabulary. */
const OUTCOME_BADGE: Record<CallOutcome, string> = {
  BOOKED: "BOOKED",
  DECLINED: "DECLINED",
  CALLBACK_REQUESTED: "CALLBACK",
  NO_ANSWER: "NO ANSWER",
};
export const outcomeBadge = (o: CallOutcome): string => OUTCOME_BADGE[o] ?? o;

const STATUS_LABELS: Record<CallJobStatus, string> = {
  PENDING: "PENDING",
  FIRED: "FIRED",
  CANCELLED: "CANCELLED",
};
export const statusLabel = (s: CallJobStatus): string => STATUS_LABELS[s] ?? s;
