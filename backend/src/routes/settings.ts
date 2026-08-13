import { Router } from "express";
import { CallWindow } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { SERVICE_INTERVAL_DAYS, WINDOW_HOURS } from "../lib/scheduling.js";

const router = Router();

/**
 * Call-time-window preferences.
 *
 * The data model (per the PRD) has no Settings table — the per-vehicle
 * `preferredWindow` is the source of truth. So "settings" here exposes the
 * window definitions + the current distribution across vehicles, lets you set a
 * process-level default window for new intakes, and can bulk-apply a window to
 * every vehicle. The default-window value lives in process memory (documented,
 * resets on restart); bulk-apply is fully persisted.
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

// PATCH /api/settings — set the default window and/or bulk-apply a window.
// Body: { defaultWindow?: CallWindow, applyToAllVehicles?: CallWindow }
router.patch(
  "/",
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    let updatedVehicles = 0;

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

    res.json({ defaultWindow, updatedVehicles });
  }),
);

/** Exposed so the intake route/UI can seed its form with the current default. */
export function getDefaultWindow(): CallWindow {
  return defaultWindow;
}

export default router;
