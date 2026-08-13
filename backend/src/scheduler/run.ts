import "dotenv/config";
import * as cron from "node-cron";
import { pathToFileURL } from "node:url";
import { fireDueCallJobs } from "../lib/scheduling.js";
import { isCalleConfigured } from "../lib/calle.js";

/**
 * node-cron job that fires due CallJobs. It calls the internal
 * `fireDueCallJobs()` function directly — no HTTP round-trip to ourselves.
 *
 * Started in-process from server.ts (SCHEDULER_ENABLED=true), or standalone via
 * `npm run scheduler` (useful if you want the API and scheduler as separate
 * processes).
 */

const CRON_EXPR = process.env.SCHEDULER_CRON?.trim() || "* * * * *";

let running = false; // guard against overlapping runs on slow calls

async function tick(): Promise<void> {
  if (running) {
    console.log("[scheduler] previous run still in progress, skipping tick");
    return;
  }
  running = true;
  try {
    const summary = await fireDueCallJobs({ respectWindow: true });
    if (summary.checked > 0) {
      console.log(
        `[scheduler] checked=${summary.checked} fired=${summary.fired} ` +
          `skippedWindow=${summary.skippedWindow} failed=${summary.failed}`,
      );
    }
  } catch (err) {
    console.error("[scheduler] tick failed:", err);
  } finally {
    running = false;
  }
}

export function startScheduler(): cron.ScheduledTask {
  if (!cron.validate(CRON_EXPR)) {
    throw new Error(`Invalid SCHEDULER_CRON expression: "${CRON_EXPR}"`);
  }
  console.log(
    `[scheduler] starting (cron="${CRON_EXPR}", CALL-E ${
      isCalleConfigured() ? "LIVE" : "DRY-RUN"
    })`,
  );
  return cron.schedule(CRON_EXPR, () => {
    void tick();
  });
}

// When executed directly (npm run scheduler), start and keep the process alive.
const invokedDirectly =
  import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (invokedDirectly) {
  startScheduler();
  console.log("[scheduler] standalone mode — press Ctrl+C to stop");
}
