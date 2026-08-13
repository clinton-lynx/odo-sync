import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, required } from "../lib/http.js";
import { createCallJobsForVehicle } from "../lib/scheduling.js";

const router = Router();

/**
 * POST /api/close-out
 * Marks a service complete for a vehicle and schedules the next cycle's
 * reminder calls (15/10/5-day CallJobs) off the new due date.
 *
 * Body: { regnNo: string, serviceDate?: string (ISO), mileage?: number }
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const regnNo: string = required(b.regnNo, "regnNo");

    const serviceDate = b.serviceDate ? new Date(b.serviceDate) : new Date();
    if (Number.isNaN(serviceDate.getTime())) {
      throw new HttpError(400, "serviceDate is not a valid date");
    }

    const existing = await prisma.vehicle.findUnique({ where: { regnNo } });
    if (!existing) throw new HttpError(404, `Vehicle ${regnNo} not found`);

    // Record the completed service (advances lastServiceDate → shifts next due date).
    await prisma.vehicle.update({
      where: { regnNo },
      data: {
        lastServiceDate: serviceDate,
        lastServiceMileage:
          b.mileage != null ? Number(b.mileage) : existing.lastServiceMileage,
      },
    });

    // Schedule the next round of reminder calls.
    const { dueDate, jobs } = await createCallJobsForVehicle(regnNo);

    const vehicle = await prisma.vehicle.findUnique({
      where: { regnNo },
      include: { callJobs: { include: { result: true } } },
    });

    res.status(201).json({ vehicle, nextDueDate: dueDate, createdJobs: jobs });
  }),
);

export default router;
