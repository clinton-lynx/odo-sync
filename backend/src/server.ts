import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { prisma } from "./lib/prisma.js";
import { isCalleConfigured } from "./lib/calle.js";
import { HttpError } from "./lib/http.js";
import { startScheduler } from "./scheduler/run.js";
import vehiclesRouter from "./routes/vehicles.js";
import closeOutRouter from "./routes/closeOut.js";
import callJobsRouter from "./routes/callJobs.js";
import settingsRouter from "./routes/settings.js";

const PORT = Number(process.env.PORT ?? 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";

const app = express();

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

// Health check — also confirms DB connectivity and CALL-E mode.
app.get("/health", async (_req, res) => {
  let db = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "down";
  }
  res.json({
    ok: db === "up",
    service: "odosync-backend",
    db,
    calle: isCalleConfigured() ? "live" : "dry-run",
    time: new Date().toISOString(),
  });
});

app.use("/api/vehicles", vehiclesRouter);
app.use("/api/close-out", closeOutRouter);
app.use("/api/call-jobs", callJobsRouter);
app.use("/api/settings", settingsRouter);

// 404 for anything unmatched.
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Central error handler — maps HttpError to its status, everything else to 500.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("[server] unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`[server] OdoSync API listening on http://localhost:${PORT}`);
  console.log(`[server] CORS origin: ${CORS_ORIGIN}`);

  if ((process.env.SCHEDULER_ENABLED ?? "true").toLowerCase() !== "false") {
    startScheduler();
  } else {
    console.log("[server] in-process scheduler disabled (SCHEDULER_ENABLED=false)");
  }
});

// Graceful shutdown so tsx watch / Ctrl+C don't leak DB connections.
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[server] ${signal} received, shutting down...`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

export { app };
