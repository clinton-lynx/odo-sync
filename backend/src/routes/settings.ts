import { Router } from "express";
import { CallWindow } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { SERVICE_INTERVAL_DAYS, WINDOW_HOURS } from "../lib/scheduling.js";
import { getWorkshopInfo, updateWorkshopInfo } from "../lib/workshop.js";
import type { WorkshopInfo } from "../lib/workshop.js";

const router = Router();

/**
 * Call-time-window preferences.
 *
 * Workshop identity/context is stored in the singleton WorkshopSettings row.
 * Call-window distribution remains vehicle-backed; the default window is still
 * process-local until the broader scheduling-settings persistence work lands.
 */

let defaultWindow: CallWindow = CallWindow.MORNING;

function parseWindow(value: unknown): CallWindow {
  if (typeof value === "string" && value in CallWindow) {
    return CallWindow[value as keyof typeof CallWindow];
  }
  throw new HttpError(
    400,
    `Invalid window: expected one of ${Object.keys(CallWindow).join(", ")}`,
  );
}

function parseWorkshopPatch(value: unknown): Partial<WorkshopInfo> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "workshop must be an object");
  }
  const source = value as Record<string, unknown>;
  const patch: Partial<WorkshopInfo> = {};
  const fields = [
    "businessName",
    "address",
    "operatingHours",
    "serviceDescription",
    "phoneNumber",
  ] as const;
  for (const field of fields) {
    const fieldValue = source[field];
    if (fieldValue === undefined) continue;
    if (typeof fieldValue !== "string") {
      throw new HttpError(400, `${field} must be a string`);
    }
    patch[field] = fieldValue;
  }
  if (patch.businessName !== undefined && !patch.businessName.trim()) {
    throw new HttpError(400, "Workshop business name cannot be empty");
  }
  return patch;
}

// GET /api/settings — window config + live distribution across vehicles.
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const grouped = await prisma.vehicle.groupBy({
      by: ["preferredWindow"],
      _count: { _all: true },
    });
    const distribution: Record<string, number> = {
      MORNING: 0,
      AFTERNOON: 0,
      EVENING: 0,
    };
    for (const row of grouped) {
      distribution[row.preferredWindow] = row._count._all;
    }

    res.json({
      workshop: await getWorkshopInfo(),
      defaultWindow,
      serviceIntervalDays: SERVICE_INTERVAL_DAYS,
      windows: Object.fromEntries(
        Object.entries(WINDOW_HOURS).map(([w, [start, end]]) => [
          w,
          { startHour: start, endHour: end },
        ]),
      ),
      distribution,
    });
  }),
);

// PATCH /api/settings — update workshop facts, default window, and/or vehicles.
router.patch(
  "/",
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    let updatedVehicles = 0;
    const workshop = b.workshop !== undefined
      ? await updateWorkshopInfo(parseWorkshopPatch(b.workshop))
      : await getWorkshopInfo();

    if (b.defaultWindow !== undefined) {
      defaultWindow = parseWindow(b.defaultWindow);
    }

    if (b.applyToAllVehicles !== undefined) {
      const window = parseWindow(b.applyToAllVehicles);
      const result = await prisma.vehicle.updateMany({
        data: { preferredWindow: window },
      });
      updatedVehicles = result.count;
    }

    res.json({ workshop, defaultWindow, updatedVehicles });
  }),
);

/** Exposed so the intake route/UI can seed its form with the current default. */
export function getDefaultWindow(): CallWindow {
  return defaultWindow;
}

export default router;
