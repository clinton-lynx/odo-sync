import type { ComponentProps, ReactNode } from "react";

/**
 * Light-theme form controls. Presentational only (no hooks) so they compose into
 * client forms. All share one control style for a consistent focus treatment.
 */
export const controlClass =
  "w-full rounded-lg border border-line bg-base px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted/50 focus:border-good/50 focus:ring-2 focus:ring-good/25 disabled:cursor-not-allowed disabled:opacity-50";

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      {children}
      {hint != null && (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      )}
    </label>
  );
}

export function TextField({
  label,
  hint,
  mono = false,
  className = "",
  id,
  ...props
}: {
  label: string;
  hint?: ReactNode;
  mono?: boolean;
} & ComponentProps<"input">) {
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        className={`${controlClass} ${mono ? "font-mono" : ""} ${className}`}
        {...props}
      />
    </Field>
  );
}

/** Native date input; the global `color-scheme: light` themes the picker. */
export function DateField(
  props: {
    label: string;
    hint?: ReactNode;
  } & ComponentProps<"input">,
) {
  return <TextField type="date" {...props} />;
}

export function SelectField({
  label,
  hint,
  className = "",
  id,
  children,
  ...props
}: {
  label: string;
  hint?: ReactNode;
} & ComponentProps<"select">) {
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="relative">
        <select
          id={id}
          className={`${controlClass} cursor-pointer appearance-none pr-9 ${className}`}
          {...props}
        >
          {children}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted"
        >
          ▾
        </span>
      </div>
    </Field>
  );
}
