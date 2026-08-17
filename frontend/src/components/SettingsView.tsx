"use client";

/**
 * Settings — quiet workshop utility. Reads GET /api/settings + the vehicle list,
 * and writes through PATCH /api/settings (default window, apply-to-all) and
 * PATCH /api/vehicles/:regn (per-vehicle window). Distribution is recomputed
 * live from the current vehicle windows.
 */

import { useState } from "react";
import {
  api,
  CALL_WINDOWS,
  type CallWindow,
  type SettingsResponse,
  type VehicleWithCount,
  type WorkshopInfo,
} from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { windowLabel } from "@/lib/format";
import { Panel, SectionHeading, Button, Loading, ErrorState } from "@/components/ui";
import { controlClass, Field, TextField } from "@/components/fields";

const fmtHour = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default function SettingsView() {
  const { data, error, loading, reload } = useAsync(
    () =>
      Promise.all([api.getSettings(), api.listVehicles()]).then(
        ([settings, vehicles]) => ({ settings, vehicles }),
      ),
    [],
  );

  const [rows, setRows] = useState<VehicleWithCount[]>([]);
  const [defaultWindow, setDefaultWindow] = useState<CallWindow | null>(null);
  const [workshopDraft, setWorkshopDraft] = useState<WorkshopInfo | null>(null);
  const [syncedData, setSyncedData] = useState<{
    settings: SettingsResponse;
    vehicles: VehicleWithCount[];
  } | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);
  const [savingWorkshop, setSavingWorkshop] = useState(false);
  const [savingRegn, setSavingRegn] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Re-seed local editable state whenever a fresh fetch lands. Adjust-on-change
  // (not an effect): stable `data` reference between renders preserves edits.
  if (data && data !== syncedData) {
    setSyncedData(data);
    setRows(data.vehicles);
    setDefaultWindow(data.settings.defaultWindow);
    setWorkshopDraft(data.settings.workshop);
  }

  if (loading && !data) return <Loading label="Loading settings…" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data || !defaultWindow || !workshopDraft) return null;

  const { settings } = data;
  const total = rows.length || 1;
  const distribution: Record<CallWindow, number> = {
    MORNING: 0,
    AFTERNOON: 0,
    EVENING: 0,
  };
  for (const v of rows) distribution[v.preferredWindow]++;

  function setWorkshopField<K extends keyof WorkshopInfo>(
    key: K,
    value: WorkshopInfo[K],
  ) {
    setWorkshopDraft((current) =>
      current ? { ...current, [key]: value } : current,
    );
  }

  async function saveWorkshop() {
    const draft = workshopDraft;
    if (!draft) return;
    if (!draft.businessName.trim()) {
      setNotice("Business name is required.");
      return;
    }
    setSavingWorkshop(true);
    setNotice(null);
    try {
      const res = await api.updateSettings({ workshop: draft });
      setWorkshopDraft(res.workshop);
      setNotice("Workshop profile saved.");
      reload();
    } catch (e) {
      setNotice(String((e as Error)?.message ?? e));
    } finally {
      setSavingWorkshop(false);
    }
  }

  async function chooseDefault(w: CallWindow) {
    if (w === defaultWindow) return;
    const prev = defaultWindow;
    setDefaultWindow(w);
    setSavingDefault(true);
    setNotice(null);
    try {
      await api.updateSettings({ defaultWindow: w });
      setNotice(`Default window set to ${windowLabel(w)}.`);
    } catch (e) {
      setDefaultWindow(prev);
      setNotice(String((e as Error)?.message ?? e));
    } finally {
      setSavingDefault(false);
    }
  }

  async function applyAll() {
    if (!defaultWindow) return;
    setApplying(true);
    setNotice(null);
    const prev = rows;
    try {
      const res = await api.updateSettings({ applyToAllVehicles: defaultWindow });
      setRows((rs) => rs.map((r) => ({ ...r, preferredWindow: defaultWindow })));
      setNotice(
        `Applied ${windowLabel(defaultWindow)} to ${res.updatedVehicles} vehicle${
          res.updatedVehicles === 1 ? "" : "s"
        }.`,
      );
    } catch (e) {
      setRows(prev);
      setNotice(String((e as Error)?.message ?? e));
    } finally {
      setApplying(false);
      setConfirmAll(false);
    }
  }

  async function setVehicleWindow(regnNo: string, w: CallWindow) {
    const prev = rows;
    setRows((rs) =>
      rs.map((r) => (r.regnNo === regnNo ? { ...r, preferredWindow: w } : r)),
    );
    setSavingRegn(regnNo);
    setNotice(null);
    try {
      await api.updateVehicle(regnNo, { preferredWindow: w });
    } catch (e) {
      setRows(prev);
      setNotice(String((e as Error)?.message ?? e));
    } finally {
      setSavingRegn(null);
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Settings"
        sub="Workshop defaults and per-vehicle call preferences."
      />

      {/* workshop defaults */}
      <Panel className="p-5">
        <div className="mb-6 border-b border-line pb-5">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
            Workshop profile
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField
              id="workshopBusinessName"
              label="Business name"
              required
              value={workshopDraft.businessName}
              onChange={(event) =>
                setWorkshopField("businessName", event.target.value)
              }
            />
            <TextField
              id="workshopPhoneNumber"
              label="Callback phone"
              mono
              value={workshopDraft.phoneNumber ?? ""}
              onChange={(event) =>
                setWorkshopField("phoneNumber", event.target.value)
              }
            />
            <TextField
              id="workshopAddress"
              label="Address"
              value={workshopDraft.address ?? ""}
              onChange={(event) =>
                setWorkshopField("address", event.target.value)
              }
            />
            <TextField
              id="workshopOperatingHours"
              label="Operating hours"
              value={workshopDraft.operatingHours ?? ""}
              onChange={(event) =>
                setWorkshopField("operatingHours", event.target.value)
              }
            />
          </div>
          <div className="mt-4">
            <Field
              label="Service description"
              htmlFor="workshopServiceDescription"
            >
              <textarea
                id="workshopServiceDescription"
                rows={3}
                value={workshopDraft.serviceDescription ?? ""}
                onChange={(event) =>
                  setWorkshopField("serviceDescription", event.target.value)
                }
                className={`${controlClass} resize-y`}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={saveWorkshop}
              disabled={savingWorkshop || !workshopDraft.businessName.trim()}
            >
              {savingWorkshop ? "Saving…" : "Save workshop profile"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
              Service interval
            </div>
            <div className="mt-2 text-3xl font-semibold tabular-nums text-ink">
              {settings.serviceIntervalDays}
              <span className="ml-1 text-base font-normal text-muted">days</span>
            </div>
          </div>

          <div className="sm:border-l sm:border-line sm:pl-6">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
              Default call window
            </div>
            <div className="mt-2 inline-flex rounded-lg border border-line p-1">
              {CALL_WINDOWS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => chooseDefault(w)}
                  disabled={savingDefault}
                  className={`rounded-md px-3 py-1.5 text-sm transition disabled:opacity-60 ${
                    defaultWindow === w
                      ? "bg-ink/[0.07] text-ink"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {windowLabel(w)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Applied to new vehicles. Existing vehicles keep their own window
              unless you apply it to all.
            </p>
            <div className="mt-3">
              {confirmAll ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted">
                    Set every vehicle to {windowLabel(defaultWindow)}?
                  </span>
                  <Button
                    variant="secondary"
                    onClick={applyAll}
                    disabled={applying}
                    className="px-3 py-1.5 text-xs"
                  >
                    {applying ? "Applying…" : "Confirm"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmAll(false)}
                    disabled={applying}
                    className="px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmAll(true)}
                  className="text-xs text-muted underline-offset-2 transition hover:text-ink hover:underline"
                >
                  Apply to all vehicles
                </button>
              )}
            </div>
          </div>
        </div>
      </Panel>

      {/* call windows + live distribution */}
      <Panel className="p-5">
        <SectionHeading
          title="Call windows"
          sub="Local hours each window is allowed to dial, and how vehicles are spread across them."
        />
        <div className="space-y-3">
          {CALL_WINDOWS.map((w) => {
            const hours = settings.windows[w];
            const count = distribution[w];
            const pct = Math.round((count / total) * 100);
            return (
              <div key={w} className="flex items-center gap-4">
                <div className="w-24 shrink-0 text-sm text-ink">
                  {windowLabel(w)}
                </div>
                <div className="w-28 shrink-0 font-mono text-xs text-muted">
                  {hours ? `${fmtHour(hours.startHour)}–${fmtHour(hours.endHour)}` : "—"}
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-ink/25"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="w-16 shrink-0 text-right font-mono text-xs text-muted">
                  {count} · {pct}%
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* per-vehicle windows */}
      <Panel className="p-5">
        <SectionHeading
          title="Vehicles"
          sub={`${rows.length} in the fleet — set each one's preferred call window.`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-[0.12em] text-muted">
                <th className="py-2 pr-4 font-medium">Reg. no.</th>
                <th className="py-2 pr-4 font-medium">Owner</th>
                <th className="py-2 pr-4 font-medium">Fleet</th>
                <th className="py-2 font-medium">Window</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.regnNo} className="border-b border-line/60 last:border-0">
                  <td className="py-2.5 pr-4 font-mono text-ink">{v.regnNo}</td>
                  <td className="py-2.5 pr-4 text-ink">{v.ownerName}</td>
                  <td className="py-2.5 pr-4 text-muted">
                    {[v.company, v.department].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="py-2.5">
                    <select
                      aria-label={`Preferred window for ${v.regnNo}`}
                      value={v.preferredWindow}
                      disabled={savingRegn === v.regnNo}
                      onChange={(e) =>
                        setVehicleWindow(v.regnNo, e.target.value as CallWindow)
                      }
                      className="cursor-pointer rounded-lg border border-line bg-base px-2 py-1.5 text-sm text-ink outline-none transition focus:border-good/50 focus:ring-2 focus:ring-good/25 disabled:opacity-60"
                    >
                      {CALL_WINDOWS.map((w) => (
                        <option key={w} value={w}>
                          {windowLabel(w)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {notice && <p className="text-xs text-muted">{notice}</p>}
    </div>
  );
}
