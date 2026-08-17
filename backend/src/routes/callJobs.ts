import { Router } from "express";
import {
  CallJobStatus,
  CallStage,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { fireDueCallJobs } from "../lib/scheduling.js";

const router = Router();

function parseEnum<T extends Record<string, string>>(
  enumObj: T,
  value: unknown,
): T[keyof T] | undefined {
  if (typeof value === "string" && value in enumObj) {
    return enumObj[value as keyof T];
  }
  return undefined;
}

// GET /api/call-jobs — list jobs, filterable by ?status= &stage= &regnNo=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const where: Prisma.CallJobWhereInput = {};
    const status = parseEnum(CallJobStatus, req.query.status);
    const stage = parseEnum(CallStage, req.query.stage);
    if (status) where.status = status;
    if (stage) where.stage = stage;
    if (typeof req.query.regnNo === "string")
      where.vehicleRegnNo = req.query.regnNo;

    const jobs = await prisma.callJob.findMany({
      where,
      orderBy: { scheduledFireDate: "asc" },
      include: { vehicle: true, result: true },
    });
    res.json(jobs);
  }),
);

// GET /api/call-jobs/due — preview jobs currently due, without firing them.
router.get(
  "/due",
  asyncHandler(async (_req, res) => {
    const jobs = await prisma.callJob.findMany({
      where: {
        status: CallJobStatus.PENDING,
        scheduledFireDate: { lte: new Date() },
      },
      orderBy: { scheduledFireDate: "asc" },
      include: { vehicle: true },
    });
    res.json(jobs);
  }),
);

// POST /api/call-jobs/fire — manually trigger the scheduler pass (demo/ops).
// A jobId targets one pending job immediately, even before its scheduled date.
router.post(
  "/fire",
  asyncHandler(async (req, res) => {
    const src = { ...req.query, ...req.body };
    const summary = await fireDueCallJobs({
      respectWindow: src.respectWindow === true || src.respectWindow === "true",
      regnNo: typeof src.regnNo === "string" ? src.regnNo : undefined,
      jobId: typeof src.jobId === "string" ? src.jobId : undefined,
      limit: src.limit != null ? Number(src.limit) : undefined,
    });
    res.json(summary);
  }),
);

// GET /api/call-jobs/:id — one job with vehicle + result.
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const job = await prisma.callJob.findUnique({
      where: { id: req.params.id },
      include: { vehicle: true, result: true },
    });
    if (!job) throw new HttpError(404, "Call job not found");
    res.json(job);
  }),
);

// POST /api/call-jobs/:id/cancel — cancel a pending job.
router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const job = await prisma.callJob.findUnique({
      where: { id: req.params.id },
    });
    if (!job) throw new HttpError(404, "Call job not found");
    if (job.status !== CallJobStatus.PENDING) {
      throw new HttpError(409, `Cannot cancel a job in status ${job.status}`);
    }
    const updated = await prisma.callJob.update({
      where: { id: req.params.id },
      data: { status: CallJobStatus.CANCELLED },
    });
    res.json(updated);
  }),
);

export default router;
