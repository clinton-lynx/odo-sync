import type { ReactNode } from "react";

/**
 * A single dashboard stat: quiet label, one confident number, optional sub-line.
 * `accent` colours the number for genuinely positive/attention states only.
 */
export function StatCard({
  label,
  value,
  sub,
  accent = "none",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "good" | "warn" | "none";
}) {
  const valueColor =
    accent === "good"
      ? "text-good"
      : accent === "warn"
        ? "text-warn"
        : "text-ink";

  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${valueColor}`}>
        {value}
      </div>
      {sub != null && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default StatCard;
