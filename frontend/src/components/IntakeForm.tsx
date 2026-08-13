"use client";

/**
 * Vehicle intake — a digitized requisition form. The left column is the form;
 * the right column is a live ServiceLogCard preview of exactly what's being
 * created. On submit the vehicle is genuinely POSTed to the backend and the
 * preview "stamps" into an on-file record with a link to schedule its reminders.
 */

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  api,
  CALL_WINDOWS,
  type CallWindow,
  type NewVehicleInput,
  type Vehicle,
} from "@/lib/api";
import { windowLabel, windowHours } from "@/lib/format";
import { TextField, SelectField, DateField } from "@/components/fields";
import { ServiceLogCard, type ServiceLogData } from "@/components/ServiceLogCard";
import { Panel, Button, SectionHeading } from "@/components/ui";

interface FormState {
  regnNo: string;
  makeModel: string;
  ownerName: string;
  phoneNumber: string;
  lastServiceDate: string;
  lastServiceMileage: string;
  company: string;
  department: string;
  preferredWindow: CallWindow;
}

const EMPTY: FormState = {
  regnNo: "",
  makeModel: "",
  ownerName: "",
  phoneNumber: "",
  lastServiceDate: "",
  lastServiceMileage: "",
  company: "",
  department: "",
  preferredWindow: "MORNING",
};

export default function IntakeForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Vehicle | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const mileageNum =
    form.lastServiceMileage.trim() === ""
      ? null
      : Number(form.lastServiceMileage);

  const preview: ServiceLogData = {
    regnNo: form.regnNo,
    makeModel: form.makeModel,
    ownerName: form.ownerName,
    phoneNumber: form.phoneNumber,
    company: form.company,
    department: form.department,
    lastServiceDate: form.lastServiceDate || null,
    lastServiceMileage: Number.isFinite(mileageNum) ? mileageNum : null,
    preferredWindow: form.preferredWindow,
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: NewVehicleInput = {
        regnNo: form.regnNo.trim(),
        makeModel: form.makeModel.trim(),
        ownerName: form.ownerName.trim(),
        phoneNumber: form.phoneNumber.trim(),
        lastServiceDate: form.lastServiceDate,
        preferredWindow: form.preferredWindow,
        company: form.company.trim() || null,
        department: form.department.trim() || null,
        lastServiceMileage:
          mileageNum != null && Number.isFinite(mileageNum) ? mileageNum : null,
      };
      const vehicle = await api.createVehicle(payload);
      setCreated(vehicle);
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setForm(EMPTY);
    setCreated(null);
    setError(null);
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      {/* left: form or success */}
      <div>
        <SectionHeading
          title="Vehicle intake"
          sub="Add a vehicle to the fleet. Its reminder calls are scheduled at close-out."
        />

        {created ? (
          <Panel className="p-5">
            <div className="text-sm text-ink">
              <span className="font-mono">{created.regnNo}</span> is on file.
            </div>
            <p className="mt-1 text-sm text-muted">
              Schedule its 15/10/5-day reminder calls by marking its next
              service due date at close-out.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`/close-out?regn=${encodeURIComponent(created.regnNo)}`}>
                <Button>Schedule reminder calls →</Button>
              </Link>
              <Button variant="secondary" onClick={reset}>
                Add another vehicle
              </Button>
              <Link href="/">
                <Button variant="ghost">Back to dashboard</Button>
              </Link>
            </div>
          </Panel>
        ) : (
          <Panel className="p-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  id="regnNo"
                  label="Reg. no."
                  mono
                  required
                  placeholder="KA01AB1234"
                  value={form.regnNo}
                  onChange={(e) => set("regnNo", e.target.value)}
                />
                <SelectField
                  id="preferredWindow"
                  label="Preferred call window"
                  value={form.preferredWindow}
                  onChange={(e) =>
                    set("preferredWindow", e.target.value as CallWindow)
                  }
                >
                  {CALL_WINDOWS.map((w) => (
                    <option key={w} value={w}>
                      {windowLabel(w)} · {windowHours(w)}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  id="makeModel"
                  label="Make / model"
                  required
                  placeholder="Maruti Swift VDi"
                  value={form.makeModel}
                  onChange={(e) => set("makeModel", e.target.value)}
                />
                <TextField
                  id="ownerName"
                  label="Owner"
                  required
                  placeholder="Anil Kumar"
                  value={form.ownerName}
                  onChange={(e) => set("ownerName", e.target.value)}
                />
                <TextField
                  id="phoneNumber"
                  label="Phone"
                  mono
                  required
                  placeholder="+919812345678"
                  hint="E.164 format — masked everywhere it's shown."
                  value={form.phoneNumber}
                  onChange={(e) => set("phoneNumber", e.target.value)}
                />
                <DateField
                  id="lastServiceDate"
                  label="Last service date"
                  required
                  value={form.lastServiceDate}
                  onChange={(e) => set("lastServiceDate", e.target.value)}
                />
                <TextField
                  id="lastServiceMileage"
                  label="Odometer (km)"
                  mono
                  type="number"
                  min={0}
                  placeholder="48200"
                  value={form.lastServiceMileage}
                  onChange={(e) => set("lastServiceMileage", e.target.value)}
                />
                <TextField
                  id="company"
                  label="Company (optional)"
                  placeholder="Blue Dart"
                  value={form.company}
                  onChange={(e) => set("company", e.target.value)}
                />
                <TextField
                  id="department"
                  label="Department (optional)"
                  placeholder="Logistics"
                  value={form.department}
                  onChange={(e) => set("department", e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-warn">{error}</p>}

              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Saving…" : "Add vehicle to fleet"}
              </Button>
            </form>
          </Panel>
        )}
      </div>

      {/* right: live preview / stamped record */}
      <div className="lg:sticky lg:top-24">
        <p className="mb-3 text-xs uppercase tracking-[0.14em] text-muted">
          {created ? "On file" : "Preview"}
        </p>
        <ServiceLogCard
          className="w-full max-w-sm"
          data={created ?? preview}
          state={created ? "complete" : "filling"}
          stamp={created ? { text: "On file", tone: "good" } : null}
          floating
        />
      </div>
    </div>
  );
}
