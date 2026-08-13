"use client";

import { useState } from "react";
import Link from "next/link";
import {
  api,
  CALL_STAGES,
  type CallJobWithRelations,
  type FireSummary,
} from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import {
  formatDate,
  maskPhone,
  relativeDays,
  stageLabel,
} from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { StatusBadge, Pill } from "@/components/StatusBadge";
import { ServiceLogCard, type Stamp } from "@/components/ServiceLogCard";
import {
  Panel,
  SectionHeading,
  Button,
  Loading,
  ErrorState,
  Empty,
} from "@/components/ui";

/** Newest-activity-first sort key: when it fired, else when it is scheduled. */
function ts(job: CallJobWithRelations): number {
  return new Date(job.result?.firedAt ?? job.scheduledFireDate).getTime();
}

function CompactRow({ job }: { job: CallJobWithRelations }) {
  const v = job.vehicle;
  const fired = job.result;
  return (
    <div className="flex items-center gap-3 border-b border-line/70 py-2.5 last:border-0">
      <div className="w-24 shrink-0 truncate font-mono text-sm text-ink">
        {job.vehicleRegnNo}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-ink">{v?.ownerName ?? "—"}</div>
        <div className="truncate font-mono text-xs text-muted">
          {v ? maskPhone(v.phoneNumber) : "—"}
        </div>
      </div>
      <div className="hidden w-20 shrink-0 text-right font-mono text-xs text-muted sm:block">
        {fired ? formatDate(fired.firedAt) : relativeDays(job.scheduledFireDate)}
      </div>
      <div className="flex w-24 shrink-0 justify-end">
        {fired ? (
          <StatusBadge outcome={fired.outcome} />
        ) : (
          <StatusBadge status={job.status} />
        )}
      </div>
    </div>
  );
}

export default function DashboardView() {
  const { data, error, loading, reload } = useAsync(
    () =>
      Promise.all([api.listCallJobs(), api.getDueCallJobs()]).then(
        ([jobs, due]) => ({ jobs, due }),
      ),
    [],
  );

  const [firing, setFiring] = useState(false);
  const [summary, setSummary] = useState<FireSummary | null>(null);
  const [fireErr, setFireErr] = useState<string | null>(null);

  async function fireDue() {
    setFiring(true);
    setFireErr(null);
    try {
      const s = await api.fireCallJobs({ respectWindow: false });
      setSummary(s);
      reload();
    } catch (e) {
      setFireErr(String((e as Error)?.message ?? e));
    } finally {
      setFiring(false);
    }
  }

  if (loading && !data) return <Loading label="Loading dashboard…" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  const jobs = data?.jobs ?? [];
  const due = data?.due ?? [];

  // ---- stats (all computed from real jobs; no server /stats endpoint) ----
  const results = jobs.map((j) => j.result).filter(Boolean);
  const fired = results.length;
  const booked = results.filter((r) => r!.outcome === "BOOKED").length;
  const noAnswer = results.filter((r) => r!.outcome === "NO_ANSWER").length;
  const needsAction = results.filter(
    (r) => r!.outcome === "NO_ANSWER" || r!.outcome === "CALLBACK_REQUESTED",
  ).length;
  const reachRate = fired
    ? Math.round(((fired - noAnswer) / fired) * 100)
    : null;

  // ---- hero card: most-urgent due vehicle, else latest booking ----
  const vehicleOf = (job?: CallJobWithRelations) =>
    job?.vehicle ??
    jobs.find((j) => j.vehicleRegnNo === job?.vehicleRegnNo)?.vehicle;

  const dueSorted = [...due].sort((a, b) =>
    a.scheduledFireDate.localeCompare(b.scheduledFireDate),
  );
  const bookedSorted = jobs
    .filter((j) => j.result?.outcome === "BOOKED")
    .sort((a, b) => ts(b) - ts(a));

  let hero: {
    job: CallJobWithRelations;
    stamp: Stamp | null;
    showOutcome: boolean;
  } | null = null;
  if (dueSorted[0]) {
    hero = {
      job: dueSorted[0],
      stamp: { text: "Call due", tone: "warn" },
      showOutcome: false,
    };
  } else if (bookedSorted[0]) {
    hero = {
      job: bookedSorted[0],
      stamp: { text: "Booked", tone: "good" },
      showOutcome: true,
    };
  } else if (jobs[0]) {
    hero = { job: jobs[0], stamp: null, showOutcome: !!jobs[0].result };
  }

  const heroVehicle = hero ? vehicleOf(hero.job) : undefined;

  const headline =
    due.length > 0
      ? `${due.length} ${due.length === 1 ? "call is" : "calls are"} due now`
      : booked > 0
        ? "All caught up — latest booking confirmed"
        : "No reminder calls scheduled yet";

  // Local calendar date for the hero eyebrow — same format as format.ts's
  // formatDate ("13 Aug 2026"), computed in local time to avoid a UTC day-shift.
  const today = new Date().toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  // ---- activity grouped by stage ----
  const groups = CALL_STAGES.map((stage) => ({
    stage,
    rows: jobs
      .filter((j) => j.stage === stage)
      .sort((a, b) => ts(b) - ts(a)),
  })).filter((g) => g.rows.length > 0);

  return (
    <div>
      {/* hero */}
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">
            OdoSync · Service reminders
          </p>
          <p
            className="mt-1 font-mono text-xs uppercase tracking-[0.16em] text-muted"
            suppressHydrationWarning
          >
            Today · {today}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {headline}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            Each vehicle gets three reminder calls before its next service —
            15, 10 and 5 days out. Fire the due calls, then track how they land.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={fireDue} disabled={firing || due.length === 0}>
              {firing
                ? "Firing…"
                : due.length > 0
                  ? `Fire due calls (${due.length})`
                  : "No calls due"}
            </Button>
            <Link
              href="/close-out"
              className="text-sm text-muted transition hover:text-ink"
            >
              Mark a service complete →
            </Link>
          </div>

          {summary && (
            <Panel className="mt-4 p-3 text-xs text-muted">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  Checked <span className="font-mono text-ink">{summary.checked}</span>
                </span>
                <span>
                  Fired <span className="font-mono text-ink">{summary.fired}</span>
                </span>
                <span>
                  Skipped (window){" "}
                  <span className="font-mono text-ink">{summary.skippedWindow}</span>
                </span>
                <span>
                  Failed <span className="font-mono text-ink">{summary.failed}</span>
                </span>
                {summary.results[0]?.dryRun && (
                  <Pill tone="muted">Dry-run</Pill>
                )}
              </div>
            </Panel>
          )}
          {fireErr && (
            <p className="mt-3 text-xs text-warn">{fireErr}</p>
          )}
        </div>

        <div className="order-1 flex justify-center lg:order-2 lg:justify-end">
          {hero && heroVehicle ? (
            <ServiceLogCard
              className="w-full max-w-sm"
              data={heroVehicle}
              stage={hero.job.stage}
              status={hero.showOutcome ? undefined : hero.job.status}
              outcome={hero.showOutcome ? hero.job.result?.outcome : undefined}
              stamp={hero.stamp}
              floating
            />
          ) : (
            <ServiceLogCard
              className="w-full max-w-sm"
              data={{}}
              state="blank"
              floating
            />
          )}
        </div>
      </section>

      {/* stats — pulled tight under the hero action so what's due → fire → result reads as one sequence */}
      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {/*
          Accent = state, not decoration. Amber (warn) means "needs attention"
          and is reserved for Needs action alone; green (good) marks positive
          Bookings. Due now and Reach rate are neutral counts/metrics, so they
          stay ink — amber on a healthy metric reads as a false alarm.
        */}
        <StatCard
          label="Due now"
          value={due.length}
          accent="none"
          sub="ready to fire"
        />
        <StatCard
          label="Bookings"
          value={booked}
          accent={booked > 0 ? "good" : "none"}
          sub="services confirmed"
        />
        <StatCard
          label="Reach rate"
          value={reachRate == null ? "—" : `${reachRate}%`}
          accent="none"
          sub={`${fired} call${fired === 1 ? "" : "s"} placed`}
        />
        <StatCard
          label="Needs action"
          value={needsAction}
          accent={needsAction > 0 ? "warn" : "none"}
          sub="no-answer + callback"
        />
      </section>

      {/* activity grouped by stage */}
      <section className="mt-10">
        <SectionHeading
          title="Recent activity"
          sub="Reminder calls across every stage"
          action={
            <Link
              href="/activity"
              className="text-xs text-muted transition hover:text-ink"
            >
              View full log →
            </Link>
          }
        />
        <Panel className="p-2">
          {groups.length === 0 ? (
            <Empty>No call jobs yet. Add a vehicle from Intake to begin.</Empty>
          ) : (
            <div className="max-h-[26rem] overflow-y-auto px-3">
              {groups.map((g) => (
                <div key={g.stage} className="py-2">
                  {/* Sticky within its own group: pins while scrolling this
                      stage, then hands off to the next. border-b gives the
                      pinned header a crisp shelf edge over the rows beneath. */}
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/95 py-1.5 backdrop-blur">
                    <Pill tone="muted">{stageLabel(g.stage)}</Pill>
                    <span className="text-xs text-muted">{g.rows.length}</span>
                  </div>
                  {g.rows.map((job) => (
                    <CompactRow key={job.id} job={job} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
