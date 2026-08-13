// Local dev database — boots a self-contained embedded PostgreSQL 18 so you can
// run OdoSync without installing Postgres. Dev-only; not used in production.
//
//   one-time:  npm i -D embedded-postgres     (from backend/, ~144MB PG binary)
//   run:       node scripts/dev-db.mjs        (leave running; Ctrl-C to stop)
//
// Data persists in backend/.dev-db (gitignored), so a restart keeps your seed.
// Delete that folder for a clean slate. The URL below matches backend/.env.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
} catch {
  console.error(
    "\n  embedded-postgres is not installed. Run:  npm i -D embedded-postgres\n",
  );
  process.exit(1);
}

const DATA_DIR = fileURLToPath(new URL("../.dev-db", import.meta.url));
const PORT = 5433;
const URL_STR = `postgresql://odosync:odosync@localhost:${PORT}/odosync?schema=public`;

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "odosync",
  password: "odosync",
  port: PORT,
  persistent: true, // keep data between runs
});

const fresh = !existsSync(join(DATA_DIR, "PG_VERSION"));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) {
  try {
    await pg.createDatabase("odosync");
  } catch (e) {
    console.error("  createDatabase note:", e?.message ?? e);
  }
}

console.log(`\n  ✓ Postgres ready on :${PORT}`);
console.log(`    DATABASE_URL="${URL_STR}"`);
console.log("    Leave this running. Ctrl-C to stop.\n");

const stop = async () => {
  try {
    await pg.stop();
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30); // keep alive
