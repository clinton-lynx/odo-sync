import assert from "node:assert/strict";
import test from "node:test";
import { CallStage, CallWindow, type Vehicle } from "@prisma/client";
import {
  buildCallRecipients,
  buildCallTask,
  formatCallTask,
  normalizeCallPhoneNumber,
} from "./calle.js";
import {
  getWorkshopInfo,
  updateWorkshopInfo,
  type WorkshopInfo,
} from "./workshop.js";

const vehicle: Vehicle = {
  regnNo: "TEST-001",
  makeModel: "Test Vehicle",
  ownerName: "Ada Customer",
  phoneNumber: "+2340000000001",
  company: null,
  department: null,
  lastServiceDate: new Date("2026-03-03T00:00:00Z"),
  lastServiceMileage: 42_000,
  preferredWindow: CallWindow.EVENING,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const workshop: WorkshopInfo = {
  businessName: "Main Street Motors",
  address: "12 Broad Street, Lagos",
  operatingHours: "Mon-Sat, 8am-6pm",
  phoneNumber: "+2340000000099",
  serviceDescription:
    "a routine service includes an oil change, filter replacement, and a brake check.",
};

const now = new Date("2026-08-15T12:00:00Z");

test("Nigerian calls use the canonical recipient list with region and locale", () => {
  assert.deepEqual(buildCallRecipients("+2340000000001"), [
    {
      phones: ["+2340000000001"],
      region: "NG",
      locale: "en-NG",
    },
  ]);
});

test("Nigerian local phone numbers are normalized for CALL-E", () => {
  assert.equal(normalizeCallPhoneNumber("0000 000 0001"), "+2340000000001");
  assert.equal(normalizeCallPhoneNumber("000-0000-0002"), "+2340000000002");
  assert.equal(normalizeCallPhoneNumber("2340000000001"), "+2340000000001");
  assert.equal(normalizeCallPhoneNumber("002340000000001"), "+2340000000001");

  assert.deepEqual(buildCallRecipients("00000000001"), [
    {
      phones: ["+2340000000001"],
      region: "NG",
      locale: "en-NG",
    },
  ]);
});

test("non-Nigerian calls do not receive Nigerian routing metadata", () => {
  assert.deepEqual(buildCallRecipients("+14155550100"), [
    { phones: ["+14155550100"] },
  ]);
});

test("buildCallTask includes workshop context and today's date", () => {
  const task = formatCallTask(vehicle, CallStage.FIFTEEN_DAY, workshop, now);

  assert.match(task, /on behalf of Main Street Motors/);
  assert.match(task, /Today's date is 15 August 2026\./);
  assert.match(task, /12 Broad Street, Lagos/);
  assert.match(task, /Mon-Sat, 8am-6pm/);
  assert.match(task, /\+2340000000099/);
  assert.match(task, /oil change, filter replacement, and a brake check/);
});

test("buildCallTask opens with a name-based identity check without guessing a title", () => {
  const task = formatCallTask(vehicle, CallStage.FIFTEEN_DAY, workshop, now);

  assert.match(
    task,
    /Start the call by politely confirming you're speaking with Ada Customer/,
  );
  assert.match(task, /"Hi, is this Ada Customer\?"/);
  assert.match(
    task,
    /Do not guess a title or honorific; just use their name as given/,
  );
  assert.doesNotMatch(task, /\b(?:Mr|Mrs|Ms|Miss|Engineer)\.? Ada Customer\b/i);
});

test("buildCallTask does not turn the preferred call window into an appointment slot", () => {
  const task = formatCallTask(vehicle, CallStage.FIFTEEN_DAY, workshop, now);

  assert.doesNotMatch(task, /matching their preferred call window/i);
  assert.doesNotMatch(task, /appointment slots in the evening/i);
  assert.match(task, /ask what appointment date and time works for them/i);
});

test("buildCallTask skips workshop facts that are not configured", () => {
  const task = formatCallTask(
    vehicle,
    CallStage.FIFTEEN_DAY,
    { businessName: "Main Street Motors" },
    now,
  );

  assert.doesNotMatch(task, /workshop is located/i);
  assert.doesNotMatch(task, /routine service/i);
  assert.doesNotMatch(task, /workshop is open/i);
  assert.doesNotMatch(task, /callback number/i);
});

test("buildCallTask preserves the three stage-specific tones", () => {
  assert.match(
    formatCallTask(vehicle, CallStage.FIFTEEN_DAY, workshop, now),
    /friendly heads-up/i,
  );
  assert.match(
    formatCallTask(vehicle, CallStage.TEN_DAY, workshop, now),
    /lock in an appointment/i,
  );
  assert.match(
    formatCallTask(vehicle, CallStage.FIVE_DAY, workshop, now),
    /final reminder/i,
  );
});

test("buildCallTask reads updated workshop settings without a restart", async () => {
  const original = await getWorkshopInfo();
  try {
    await updateWorkshopInfo({ businessName: "Lynx First Test Workshop" });
    assert.match(
      await buildCallTask(vehicle, CallStage.FIFTEEN_DAY, now),
      /on behalf of Lynx First Test Workshop/,
    );

    await updateWorkshopInfo({ businessName: "Lynx Second Test Workshop" });
    assert.match(
      await buildCallTask(vehicle, CallStage.FIFTEEN_DAY, now),
      /on behalf of Lynx Second Test Workshop/,
    );
  } finally {
    await updateWorkshopInfo({
      businessName: original.businessName,
      address: original.address ?? "",
      operatingHours: original.operatingHours ?? "",
      serviceDescription: original.serviceDescription ?? "",
      phoneNumber: original.phoneNumber ?? "",
    });
  }
});
