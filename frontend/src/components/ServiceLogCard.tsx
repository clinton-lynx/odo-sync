import type {
  CallOutcome,
  CallStage,
  CallJobStatus,
  CallWindow,
} from "@/lib/api";
import {
  formatDate,
  maskPhone,
  stageShort,
  windowLabel,
  windowHours,
} from "@/lib/format";
import { StatusBadge, type Tone } from "@/components/StatusBadge";

/**
 * The signature element: a digitized "Vehicle Service Log" requisition form,
 * rendered as a crisp white document lifted off the off-white canvas by
 * elevation (soft shadow + hairline), not color.
 *
 * The visual anchor across dashboard (live example), intake (live preview) and
 * close-out (outcome). Purely presentational; safe in server or client trees.
 */

/** Loose shape so it renders equally from a saved Vehicle or an in-progress form. */
export interface ServiceLogData {
  regnNo?: string | null;
  makeModel?: string | null;
  ownerName?: string | null;
  phoneNumber?: string | null;
  company?: string | null;
  department?: string | null;
  lastServiceDate?: string | null;
  lastServiceMileage?: number | null;
  preferredWindow?: CallWindow | null;
}

export interface Stamp {
  text: string;
  tone: Tone;
}

/** Ink shades for the rubber stamp, aligned to the accent tokens. */
const STAMP_INK: Record<Tone, string> = {
  good: "#1d9a6c",
  warn: "#c77c1f",
  muted: "#6b6d76",
};

function Cell({
  label,
  value,
  mono = false,
  state,
  className = "",
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  state: "blank" | "filling" | "complete";
  className?: string;
}) {
  const empty = value == null || value === "";
  return (
    <div className={className}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </div>
      {empty ? (
        state === "complete" ? (
          <div className="mt-1 text-sm text-ink">—</div>
        ) : (
          <div className="mt-2.5 h-px w-full bg-line" aria-hidden />
        )
      ) : (
        <div
          className={`mt-1 truncate text-sm text-ink ${mono ? "font-mono" : ""}`}
        >
          {value}
        </div>
      )}
    </div>
  );
}

export function ServiceLogCard({
  data,
  stage,
  status,
  outcome,
  state = "complete",
  stamp = null,
  floating = false,
  tilt = false,
  className = "",
}: {
  data: ServiceLogData;
  stage?: CallStage;
  status?: CallJobStatus;
  outcome?: CallOutcome;
  state?: "blank" | "filling" | "complete";
  stamp?: Stamp | null;
  /** Soft elevation shadow — signature/hero moments only. */
  floating?: boolean;
  /** Slight rotation — marketing contexts only; never on functional rows. */
  tilt?: boolean;
  className?: string;
}) {
  const blank = state === "blank";
  const mileage =
    data.lastServiceMileage != null
      ? `${data.lastServiceMileage.toLocaleString()} km`
      : null;
  const window = data.preferredWindow
    ? `${windowLabel(data.preferredWindow)} · ${windowHours(data.preferredWindow)}`
    : null;
  const org = [data.company, data.department].filter(Boolean).join(" · ");

  return (
    <div
      className={`relative overflow-hidden rounded-[16px] bg-white text-ink ring-1 ring-line transition-transform duration-300 ${
        floating
          ? "shadow-float hover:-translate-y-0.5"
          : "shadow-card"
      } ${tilt ? "-rotate-[1.4deg]" : ""} ${className}`}
    >
      {/* perforated top edge — the paper tell */}
      <div
        aria-hidden
        className="h-1.5 w-full bg-[repeating-linear-gradient(90deg,#FFFFFF_0_9px,#E7E7E3_9px_10px)]"
      />

      <div className="px-6 pb-6 pt-5">
        {/* letterhead */}
        <div className="flex items-start justify-between border-b border-line pb-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink">
              Vehicle Service Log
            </div>
            <div className="mt-0.5 text-[10px] text-muted">
              OdoSync · Workshop requisition
            </div>
          </div>
          <div className="text-right font-mono text-[10px] leading-tight text-muted">
            <div>FORM VSR-01</div>
            {stage && <div className="mt-0.5">{stageShort(stage)}</div>}
          </div>
        </div>

        {/* registration plate */}
        <div className="mt-4">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
            Reg. No.
          </div>
          {data.regnNo ? (
            <div className="mt-1 font-mono text-2xl font-semibold tracking-wide text-ink">
              {data.regnNo}
            </div>
          ) : (
            <div
              className="mt-2.5 h-px w-40 bg-line"
              aria-hidden={!blank}
            />
          )}
        </div>

        {/* field grid */}
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3.5">
          <Cell label="Make / Model" value={data.makeModel} state={state} />
          <Cell label="Owner" value={data.ownerName} state={state} />
          <Cell
            label="Contact"
            value={data.phoneNumber ? maskPhone(data.phoneNumber) : null}
            mono
            state={state}
          />
          <Cell label="Preferred window" value={window} state={state} />
          <Cell
            label="Last service"
            value={data.lastServiceDate ? formatDate(data.lastServiceDate) : null}
            mono
            state={state}
          />
          <Cell label="Odometer" value={mileage} mono state={state} />
          {org && (
            <Cell
              label="Fleet"
              value={org}
              state={state}
              className="col-span-2"
            />
          )}
        </div>

        {/* outcome / status footer */}
        {(outcome || status) && (
          <div className="mt-5 flex items-center justify-between border-t border-line pt-3">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
              Outcome
            </span>
            <StatusBadge outcome={outcome} status={status} />
          </div>
        )}
      </div>

      {/* rubber stamp */}
      {stamp && (
        <div
          className="pointer-events-none absolute bottom-6 right-5 select-none"
          style={{ transform: "rotate(-12deg)" }}
          aria-hidden
        >
          <div
            className="rounded-[6px] border-[2.5px] px-3 py-1 text-lg font-extrabold uppercase tracking-[0.2em]"
            style={{
              color: STAMP_INK[stamp.tone],
              borderColor: STAMP_INK[stamp.tone],
              opacity: 0.82,
              boxShadow: `inset 0 0 0 1.5px ${STAMP_INK[stamp.tone]}22`,
            }}
          >
            {stamp.text}
          </div>
        </div>
      )}
    </div>
  );
}

export default ServiceLogCard;
