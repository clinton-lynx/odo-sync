import { Router } from "express";
import { CallWindow, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, required } from "../lib/http.js";

const router = Router();

function parseWindow(value: unknown, field = "preferredWindow"): CallWindow {
  if (typeof value === "string" && value in CallWindow) {
    return CallWindow[value as keyof typeof CallWindow];
  }
  throw new HttpError(
    400,
    `Invalid ${field}: expected one of ${Object.keys(CallWindow).join(", ")}`,
  );
}

// GET /api/vehicles — list all vehicles with a count of their call jobs.
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const vehicles = await prisma.vehicle.findMany({
      orderBy: { lastServiceDate: "asc" },
      include: { _count: { select: { callJobs: true } } },
    });
    res.json(vehicles);
  }),
);

// GET /api/vehicles/:regnNo — one vehicle with its jobs + results.
router.get(
  "/:regnNo",
  asyncHandler(async (req, res) => {
    const vehicle = await prisma.vehicle.findUnique({
      where: { regnNo: req.params.regnNo },
      include: {
        callJobs: {
          orderBy: { scheduledFireDate: "asc" },
          include: { result: true },
        },
      },
    });
    if (!vehicle) throw new HttpError(404, "Vehicle not found");
    res.json(vehicle);
  }),
);

// POST /api/vehicles — create a vehicle (target of the digitized intake form).
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};

    const lastServiceDate = new Date(required(b.lastServiceDate, "lastServiceDate"));
    if (Number.isNaN(lastServiceDate.getTime())) {
      throw new HttpError(400, "lastServiceDate is not a valid date");
    }

    const data: Prisma.VehicleCreateInput = {
      regnNo: required(b.regnNo, "regnNo"),
      makeModel: required(b.makeModel, "makeModel"),
      ownerName: required(b.ownerName, "ownerName"),
      phoneNumber: required(b.phoneNumber, "phoneNumber"),
      company: b.company ?? null,
      department: b.department ?? null,
      lastServiceDate,
      lastServiceMileage:
        b.lastServiceMileage != null ? Number(b.lastServiceMileage) : null,
      preferredWindow: b.preferredWindow
        ? parseWindow(b.preferredWindow)
        : CallWindow.MORNING,
    };

    const existing = await prisma.vehicle.findUnique({
      where: { regnNo: data.regnNo },
    });
    if (existing) {
      throw new HttpError(409, `Vehicle ${data.regnNo} already exists`);
    }

    const vehicle = await prisma.vehicle.create({ data });
    res.status(201).json(vehicle);
  }),
);

// PATCH /api/vehicles/:regnNo — update mutable fields (e.g. preferred window).
router.patch(
  "/:regnNo",
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const data: Prisma.VehicleUpdateInput = {};
    if (b.makeModel !== undefined) data.makeModel = b.makeModel;
    if (b.ownerName !== undefined) data.ownerName = b.ownerName;
    if (b.phoneNumber !== undefined) data.phoneNumber = b.phoneNumber;
    if (b.company !== undefined) data.company = b.company;
    if (b.department !== undefined) data.department = b.department;
    if (b.lastServiceDate !== undefined)
      data.lastServiceDate = new Date(b.lastServiceDate);
    if (b.lastServiceMileage !== undefined)
      data.lastServiceMileage =
        b.lastServiceMileage != null ? Number(b.lastServiceMileage) : null;
    if (b.preferredWindow !== undefined)
      data.preferredWindow = parseWindow(b.preferredWindow);

    try {
      const vehicle = await prisma.vehicle.update({
        where: { regnNo: req.params.regnNo },
        data,
      });
      res.json(vehicle);
    } catch {
      throw new HttpError(404, "Vehicle not found");
    }
  }),
);

export default router;
