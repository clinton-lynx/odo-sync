import type { ComponentProps, ReactNode } from "react";

/** Standard surface container — hairline border, white surface fill. */
export function Panel({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-card border border-line bg-surface ${className}`}>
      {children}
    </div>
  );
}

/** Section heading with optional supporting line and a right-aligned action. */
export function SectionHeading({
  title,
  sub,
  action,
  className = "",
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {sub != null && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: {
  variant?: "primary" | "secondary" | "ghost";
} & ComponentProps<"button">) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
  const look =
    variant === "primary"
      ? "bg-ink text-base hover:bg-ink/90"
      : variant === "secondary"
        ? "border border-line text-ink hover:bg-ink/[0.04]"
        : "text-muted hover:text-ink";
  return <button className={`${base} ${look} ${className}`} {...props} />;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
      <span className="h-2 w-2 animate-pulse rounded-full bg-muted" />
      {label}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-card border border-warn/30 bg-warn/10 p-4 text-sm">
      <div className="font-medium text-warn">Something went wrong</div>
      <div className="mt-1 text-muted">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs text-ink transition hover:bg-ink/[0.04]"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-12 text-center text-sm text-muted">{children}</div>;
}
