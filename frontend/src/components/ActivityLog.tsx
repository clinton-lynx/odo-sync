"use client";

/**
 * Call activity log. Fetches every call job (with vehicle + result) and filters
 * entirely client-side — the backend exposes no filtering beyond stage/status/
 * regn, and none for outcome or date range. Rows expand to a receipt-style
 * outcome detail; pending jobs can be cancelled (POST /api/call-jobs/:id/cancel).
 */

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  api,
  CALL_STAGES,
  type CallJobWithRelations,
  type CallOutcome,
  type CallJobStatus,
  type CallStage,
} from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import {
  formatDate,
  formatDateTime,
  formatShortDate,
  maskPhone,
  outcomeLabel,
  relativeDays,
  stageLabel,
  windowLabel,
} from "@/lib/format";
import { StatusBadge, Pill } from "@/components/StatusBadge";
import {
  Panel,
  SectionHeading,
  Button,
  Loading,
  ErrorState,
  Empty,
} from "@/components/ui";

const OUTCOMES: CallOutcome[] = [
  "BOOKED",
  "CALLBACK_REQUESTED",
  "NO_ANSWER",
  "DECLINED",
];
const STATUSES: CallJobStatus[] = ["PENDING", "FIRED", "CANCELLED"];

const ctl =
  "rounded-lg border border-line bg-base px-3 py-2 text-sm text-ink outline-none transition focus:border-good/50 focus:ring-2 focus:ring-good/25";

function ts(job: CallJobWithRelations): number {
  return new Date(job.result?.firedAt ?? job.scheduledFireDate).getTime();
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-muted">{k}</span>
      <span className="text-right font-mono text-ink">{v}</span>
    </div>
  );
}

function Row({
  job,
  expanded,
  onToggle,
  onCancel,
  onCallNow,
  cancelling,
  calling,
}: {
  job: CallJobWithRelations;
  expanded: boolean;
  onToggle: () => void;
  onCancel: () => void;
  onCallNow: () => void;
  cancelling: boolean;
  calling: boolean;
}) {
  const v = job.vehicle;
  const r = job.result;
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="border-b border-line/60 last:border-0">
      <div className="flex items-center gap-2 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:bg-ink/[0.03]"
        >
          <Pill tone="muted" className="hidden shrink-0 sm:inline-flex">
            {stageLabel(job.stage)}
          </Pill>
          <div className="w-24 shrink-0 truncate font-mono text-sm text-ink">
            {job.vehicleRegnNo}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-ink">{v?.ownerName ?? "—"}</div>
            <div className="truncate font-mono text-xs text-muted">
              {v ? maskPhone(v.phoneNumber) : "—"}
            </div>
            {!r && (
              <div className="truncate text-[10px] text-muted sm:hidden">
                {formatShortDate(job.scheduledFireDate)} · {windowLabel(job.preferredWindow)}
              </div>
            )}
          </div>
          <div className="hidden w-44 shrink-0 text-right font-mono text-xs text-muted md:block">
            {r ? (
              formatDate(r.firedAt)
            ) : (
              <>
                {relativeDays(job.scheduledFireDate)} ·{" "}
                {formatShortDate(job.scheduledFireDate)} ·{" "}
                {windowLabel(job.preferredWindow)}
              </>
            )}
          </div>
          <div className="flex w-24 shrink-0 justify-end">
            {r ? (
              <StatusBadge outcome={r.outcome} />
            ) : (
              <StatusBadge status={job.status} />
            )}
          </div>
          <span
            aria-hidden
            className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            ›
          </span>
        </button>
        {job.status === "PENDING" && (
          <Button
            variant="secondary"
            onClick={onCallNow}
            disabled={calling}
            className="shrink-0 px-3 py-1.5 text-xs"
          >
            {calling ? "Calling…" : "Call now"}
          </Button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-dashed border-line px-1 pb-4 pt-3">
          <div className="rounded-lg bg-base p-3 text-xs">
            <KV k="Call ID" v={job.id} />
            <KV k="Stage" v={stageLabel(job.stage)} />
            <KV k="Scheduled" v={formatDate(job.scheduledFireDate)} />
            <KV k="Window" v={windowLabel(job.preferredWindow)} />
            {r ? (
              <>
                <KV k="Fired" v={formatDateTime(r.firedAt)} />
                <KV k="Outcome" v={outcomeLabel(r.outcome)} />
                {r.calleCallId && <KV k="CALL-E task" v={r.calleCallId} />}
                {r.providerCallId && (
                  <KV k="Provider call" v={r.providerCallId} />
                )}
                {r.providerAttemptStatus && (
                  <KV k="Provider status" v={r.providerAttemptStatus} />
                )}
                {r.providerFailureCode && (
                  <KV k="Failure code" v={r.providerFailureCode} />
                )}
                {r.providerFailureMessage && (
                  <KV k="Failure reason" v={r.providerFailureMessage} />
                )}
                {r.proposedAppointmentDate && (
                  <KV
                    k="Proposed appointment"
                    v={formatDate(r.proposedAppointmentDate)}
                  />
                )}
                {r.notes && (
                  <div className="mt-2 border-t border-line pt-2">
                    <div className="text-muted">Notes</div>
                    <div className="mt-1 text-ink">{r.notes}</div>
                  </div>
                )}
              </>
            ) : (
              <KV k="Status" v={job.status} />
            )}
          </div>

          {job.status === "PENDING" && (
            <div className="mt-3 flex items-center gap-2">
              {confirm ? (
                <>
                  <span className="text-xs text-muted">Cancel this call?</span>
                  <Button
                    variant="secondary"
                    onClick={onCancel}
                    disabled={cancelling}
                    className="px-3 py-1.5 text-xs"
                  >
                    {cancelling ? "Cancelling…" : "Confirm cancel"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirm(false)}
                    disabled={cancelling}
                    className="px-3 py-1.5 text-xs"
                  >
                    Keep
                  </Button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirm(true)}
                  className="text-xs text-muted underline-offset-2 transition hover:text-ink hover:underline"
                >
                  Cancel this scheduled call
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ActivityLog() {
  const params = useSearchParams();
  const { data, error, loading, reload } = useAsync(
    () => api.listCallJobs(),
    [],
  );

  // Prefill the search from ?regn= (close-out deep-links here) — lazy init, read
  // once at mount from the deterministic URL, so no effect / no cascading render.
  const [search, setSearch] = useState(() => params.get("regn") ?? "");
  const [stage, setStage] = useState<CallStage | "">("");
  const [status, setStatus] = useState<CallJobStatus | "">("");
  const [outcome, setOutcome] = useState<CallOutcome | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [callingId, setCallingId] = useState<string | null>(null);

  const jobs = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs
      .filter((j) => {
        if (stage && j.stage !== stage) return false;
        if (status && j.status !== status) return false;
        if (outcome && j.result?.outcome !== outcome) return false;
        if (q) {
          const hay = `${j.vehicleRegnNo} ${j.vehicle?.ownerName ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (from || to) {
          const fired = j.result?.firedAt?.slice(0, 10);
          if (!fired) return false;
          if (from && fired < from) return false;
          if (to && fired > to) return false;
        }
        return true;
      })
      .sort((a, b) => ts(b) - ts(a));
  }, [jobs, search, stage, status, outcome, from, to]);

  async function cancel(id: string) {
    setCancellingId(id);
    try {
      await api.cancelCallJob(id);
      reload();
    } catch (e) {
      // surface inline; keep the row open
      alert(String((e as Error)?.message ?? e));
    } finally {
      setCancellingId(null);
    }
  }

  async function callNow(job: CallJobWithRelations) {
    const owner = job.vehicle?.ownerName ?? job.vehicleRegnNo;
    if (!window.confirm(`Call ${owner} now?`)) return;
    setCallingId(job.id);
    try {
      const summary = await api.fireCallJobs({
        jobId: job.id,
        respectWindow: false,
        limit: 1,
      });
      if (summary.fired !== 1) {
        throw new Error(
          summary.failed > 0
            ? "CALL-E could not complete this call."
            : "This call job is no longer pending.",
        );
      }
      reload();
    } catch (e) {
      alert(String((e as Error)?.message ?? e));
    } finally {
      setCallingId(null);
    }
  }

  const hasFilters = !!(search || stage || status || outcome || from || to);
  function clearFilters() {
    setSearch("");
    setStage("");
    setStatus("");
    setOutcome("");
    setFrom("");
    setTo("");
  }

  if (loading && !data) return <Loading label="Loading activity…" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Call activity"
        sub={`${filtered.length} of ${jobs.length} call${jobs.length === 1 ? "" : "s"}`}
        action={
          <button
            onClick={reload}
            className="text-xs text-muted transition hover:text-ink"
          >
            Refresh
          </button>
        }
      />

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${ctl} min-w-[12rem] flex-1`}
          placeholder="Search reg. no or owner"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Stage"
          className={`${ctl} cursor-pointer`}
          value={stage}
          onChange={(e) => setStage(e.target.value as CallStage | "")}
        >
          <option value="">All stages</option>
          {CALL_STAGES.map((s) => (
            <option key={s} value={s}>
              {stageLabel(s)}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          className={`${ctl} cursor-pointer`}
          value={status}
          onChange={(e) => setStatus(e.target.value as CallJobStatus | "")}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Outcome"
          className={`${ctl} cursor-pointer`}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as CallOutcome | "")}
        >
          <option value="">All outcomes</option>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {outcomeLabel(o)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Fired between</span>
        <input
          type="date"
          aria-label="From date"
          className={ctl}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span>–</span>
        <input
          type="date"
          aria-label="To date"
          className={ctl}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="ml-1 text-muted underline-offset-2 transition hover:text-ink hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* log */}
      <Panel className="px-4">
        {filtered.length === 0 ? (
          <Empty>
            {jobs.length === 0
              ? "No call jobs yet."
              : "No calls match these filters."}
          </Empty>
        ) : (
          filtered.map((job) => (
            <Row
              key={job.id}
              job={job}
              expanded={expandedId === job.id}
              onToggle={() =>
                setExpandedId((id) => (id === job.id ? null : job.id))
              }
              onCancel={() => cancel(job.id)}
              onCallNow={() => callNow(job)}
              cancelling={cancellingId === job.id}
              calling={callingId === job.id}
            />
          ))
        )}
      </Panel>
    </div>
  );
}
