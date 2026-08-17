"use client";

/**
 * Service close-out. Mark a vehicle's service complete; the backend computes the
 * next due date and schedules its three reminder calls. Before confirming we
 * show a genuine 15/10/5-day preview (the one place numbered steps are honest —
 * it's a real cadence). On confirm we render the actual createdJobs + nextDueDate
 * from the response and stamp the record SERVICED.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  api,
  CALL_STAGES,
  type CloseOutResponse,
  type VehicleWithCount,
} from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { formatDate, stageLabel, STAGE_DAYS } from "@/lib/format";
import { TextField, SelectField, DateField } from "@/components/fields";
import { ServiceLogCard } from "@/components/ServiceLogCard";
import {
  Panel,
  Button,
  SectionHeading,
  Loading,
  ErrorState,
} from "@/components/ui";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Add days to a YYYY-MM-DD string, parsing at local midnight (no UTC drift). */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

export default function CloseOutPanel() {
  const params = useSearchParams();
  const prefillRegn = params.get("regn") ?? "";

  const { data, error, loading, reload } = useAsync(
    () =>
      Promise.all([api.listVehicles(), api.getSettings()]).then(
        ([vehicles, settings]) => ({ vehicles, settings }),
      ),
    [],
  );

  const [regnNo, setRegnNo] = useState("");
  const [regnInitialized, setRegnInitialized] = useState(false);
  // Default the service date to today. Lazy init (this page renders client-side
  // via useSearchParams), so there's no server/client date mismatch.
  const [serviceDate, setServiceDate] = useState(() => ymd(new Date()));
  const [mileage, setMileage] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [result, setResult] = useState<CloseOutResponse | null>(null);

  // Choose the initial vehicle once the list loads: the ?regn= prefill if it
  // matches, else the first vehicle. Adjust-on-load (guarded to run once).
  if (!regnInitialized && data?.vehicles?.length) {
    setRegnInitialized(true);
    const match = data.vehicles.find((v) => v.regnNo === prefillRegn);
    setRegnNo(match ? match.regnNo : data.vehicles[0].regnNo);
  }

  const vehicles = data?.vehicles ?? [];
  const settings = data?.settings;
  const selected: VehicleWithCount | undefined = vehicles.find(
    (v) => v.regnNo === regnNo,
  );

  const mileageNum = mileage.trim() === "" ? null : Number(mileage);

  // Client-side preview of the schedule the backend will create.
  const preview = useMemo(() => {
    if (!settings || !serviceDate) return null;
    const nextDue = addDays(serviceDate, settings.serviceIntervalDays);
    return {
      nextDue,
      jobs: CALL_STAGES.map((stage) => ({
        stage,
        fireDate: addDays(nextDue, -STAGE_DAYS[stage]),
      })),
    };
  }, [settings, serviceDate]);

  async function confirm() {
    if (!regnNo) return;
    setBusy(true);
    setSubmitErr(null);
    try {
      const res = await api.closeOut({
        regnNo,
        serviceDate: serviceDate || undefined,
        mileage:
          mileageNum != null && Number.isFinite(mileageNum)
            ? mileageNum
            : undefined,
      });
      setResult(res);
      reload();
    } catch (e) {
      setSubmitErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setSubmitErr(null);
    setMileage("");
  }

  if (loading && !data) return <Loading label="Loading vehicles…" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  const createdSorted = result
    ? [...result.createdJobs].sort((a, b) =>
        a.scheduledFireDate.localeCompare(b.scheduledFireDate),
      )
    : [];

  return (
    <div className="mx-auto grid max-w-4xl items-start gap-8 lg:grid-cols-[1.1fr_1fr]">
      {/* left: form / confirmation */}
      <div>
        <SectionHeading
          title="Close out a service"
          sub="Mark a service complete and schedule its next reminder calls."
        />

        {result ? (
          <Panel className="p-5">
            <div className="flex items-center gap-2 text-sm text-ink">
              <span className="font-mono">{result.vehicle.regnNo}</span> serviced.
            </div>
            <p className="mt-1 text-sm text-muted">
              Next service due{" "}
              <span className="font-mono text-ink">
                {formatDate(result.nextDueDate)}
              </span>
              . {result.createdJobs.length} reminder call
              {result.createdJobs.length === 1 ? "" : "s"} scheduled:
            </p>

            <ol className="mt-4 space-y-2">
              {createdSorted.map((job, i) => (
                <li
                  key={job.id}
                  className="flex items-center gap-3 rounded-lg border border-line bg-base px-3 py-2.5"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-good/40 font-mono text-xs text-good">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-ink">
                    {stageLabel(job.stage)}
                  </span>
                  <span className="font-mono text-xs text-muted">
                    {formatDate(job.scheduledFireDate)}
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/">
                <Button>Back to dashboard</Button>
              </Link>
              <Link href={`/activity?regn=${encodeURIComponent(result.vehicle.regnNo)}`}>
                <Button variant="secondary">View its calls</Button>
              </Link>
              <Button variant="ghost" onClick={reset}>
                Close out another
              </Button>
            </div>
          </Panel>
        ) : (
          <Panel className="p-5">
            <div className="space-y-4">
              <SelectField
                id="regnNo"
                label="Vehicle"
                value={regnNo}
                onChange={(e) => setRegnNo(e.target.value)}
              >
                {vehicles.length === 0 && <option value="">No vehicles</option>}
                {vehicles.map((v) => (
                  <option key={v.regnNo} value={v.regnNo}>
                    {v.regnNo} — {v.makeModel} · {v.ownerName}
                  </option>
                ))}
              </SelectField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DateField
                  id="serviceDate"
                  label="Service date"
                  value={serviceDate}
                  onChange={(e) => setServiceDate(e.target.value)}
                />
                <TextField
                  id="mileage"
                  label="Odometer today (km)"
                  mono
                  type="number"
                  min={0}
                  placeholder="52000"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                />
              </div>

              {/* genuine 15/10/5 preview */}
              {preview && (
                <div className="rounded-lg border border-line bg-base p-3">
                  <div className="mb-2 text-xs text-muted">
                    Next service due{" "}
                    <span className="font-mono text-ink">
                      {formatDate(preview.nextDue)}
                    </span>{" "}
                    ({settings?.serviceIntervalDays}-day interval)
                  </div>
                  <ol className="space-y-1.5">
                    {preview.jobs.map((job, i) => (
                      <li
                        key={job.stage}
                        className="flex items-center gap-3 text-sm"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[10px] text-muted">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-ink">
                          {stageLabel(job.stage)}
                        </span>
                        <span className="font-mono text-xs text-muted">
                          {formatDate(job.fireDate)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {submitErr && <p className="text-sm text-warn">{submitErr}</p>}

              <div>
                <Button
                  onClick={confirm}
                  disabled={busy || !regnNo}
                  className="w-full"
                >
                  {busy ? "Scheduling…" : "Mark serviced & schedule calls"}
                </Button>
                <p className="mt-2 text-center text-xs text-muted">
                  This creates 3 scheduled calls.
                </p>
              </div>
            </div>
          </Panel>
        )}
      </div>

      {/* right: the record */}
      <div className="lg:sticky lg:top-24">
        <p className="mb-3 text-xs uppercase tracking-[0.14em] text-muted">
          {result ? "Serviced" : "Record"}
        </p>
        {result ? (
          <ServiceLogCard
            className="w-full max-w-sm"
            data={result.vehicle}
            state="complete"
            stamp={{ text: "Serviced", tone: "good" }}
            floating
          />
        ) : selected ? (
          <ServiceLogCard
            className="w-full max-w-sm"
            data={selected}
            state="complete"
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
    </div>
  );
}
