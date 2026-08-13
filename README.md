# OdoSync

OdoSync phones fleet-vehicle owners **ahead of their next service due date** to
book an appointment. For every vehicle it schedules three reminder calls — **15,
10 and 5 days** before the service is due — and places them (via
[CALL-E](https://github.com/CALLE-AI/call-e-integrations) AI calling) inside the
owner's preferred time window. Call outcomes (booked / declined / callback /
no-answer) are recorded, and completing a service ("close-out") rolls the cycle
forward to the next due date.

> **Status:** full-stack scaffold with **genuine** connections wired end-to-end
> (frontend → backend → PostgreSQL, node-cron scheduler, CALL-E integration).
> The UI is intentionally minimal — the frontend proves the wiring, not the
> design.

---

## Architecture

```
┌─────────────────────────┐        REST (fetch, CORS)        ┌──────────────────────────┐
│  Frontend (Next.js)      │  ───────────────────────────▶   │  Backend (Express API)     │
│  http://localhost:3000   │                                  │  http://localhost:4000     │
│  App Router · TS · TW    │  ◀───────────────────────────   │                            │
│  src/lib/api.ts = the    │           JSON                   │  ├─ /api/vehicles          │
│  single connection layer │                                  │  ├─ /api/close-out         │
└─────────────────────────┘                                  │  ├─ /api/call-jobs         │
                                                              │  ├─ /api/settings          │
                                                              │  ├─ node-cron scheduler ───┼─▶ fireDueCallJobs()
                                                              │  └─ CALL-E integration ────┼─▶ real call / dry-run
                                                              └─────────────┬──────────────┘
                                                                            │ Prisma
                                                                            ▼
                                                                   ┌──────────────────┐
                                                                   │   PostgreSQL      │
                                                                   └──────────────────┘
```

- **Frontend** is API-only: it has **no Next.js API routes**. Every byte of data
  is fetched from the backend over REST through the typed client in
  `frontend/src/lib/api.ts`, using `NEXT_PUBLIC_API_URL`.
- **Backend** is a standalone Express + TypeScript API (ESM). Prisma is the ORM.
- **Scheduler** is `node-cron` running **inside the backend process**, calling
  the internal `fireDueCallJobs()` function directly — no self-HTTP.
- **CALL-E** places real outbound calls only when `CALLE_API_KEY` is set;
  otherwise the backend runs in **DRY-RUN** mode and simulates every call.

---

## Prerequisites

- **Node.js ≥ 22** (required by the `@call-e/calle` SDK).
- **A PostgreSQL database.** Any of:
  - Local Docker (quickstart below), or
  - A hosted database (Neon, Supabase, etc.) — just use its connection string.

### PostgreSQL via Docker (optional quickstart)

```bash
docker run --name odosync-pg -e POSTGRES_USER=odosync \
  -e POSTGRES_PASSWORD=odosync -e POSTGRES_DB=odosync \
  -p 5432:5432 -d postgres:16
```

This matches the default `DATABASE_URL` in `backend/.env.example`.

---

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env          # then edit DATABASE_URL etc. as needed

npm run prisma:generate       # generate the Prisma client
npm run prisma:migrate        # create/apply the migration (dev)
npm run db:seed               # (optional) load demo fleet data
```

For a non-dev database (e.g. hosted), use `npm run prisma:deploy` instead of
`prisma:migrate` to apply existing migrations without prompting.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## Running (two dev servers)

Open two terminals:

```bash
# Terminal 1 — backend API + in-process scheduler on :4000
cd backend && npm run dev

# Terminal 2 — frontend on :3000
cd frontend && npm run dev
```

Then open <http://localhost:3000>.

Confirm the backend is healthy:

```bash
curl http://localhost:4000/health
# {"ok":true,"service":"odosync-backend","db":"up","calle":"dry-run", ...}
```

---

## The scheduler

`node-cron` starts automatically inside the backend process (unless
`SCHEDULER_ENABLED=false`). On each tick it calls `fireDueCallJobs()`, which:

1. finds `PENDING` call jobs whose `scheduledFireDate <= now`,
2. skips any whose **preferred window** doesn't match the current hour
   (MORNING 08–12, AFTERNOON 12–17, EVENING 17–20 local time),
3. places (or simulates) the call, writes a `CallResult`, and marks the job
   `FIRED`.

You can also run it as a **separate process**:

```bash
cd backend && npm run scheduler
```

Or trigger a pass manually (great for demos — bypasses the window check):

```bash
curl -X POST http://localhost:4000/api/call-jobs/fire \
  -H 'Content-Type: application/json' -d '{"respectWindow":false}'
```

`SCHEDULER_CRON` controls the cadence (default `* * * * *`, i.e. every minute).

---

## CALL-E: dry-run vs live

| `CALLE_API_KEY` | Behaviour                                                             |
| --------------- | --------------------------------------------------------------------- |
| **empty**       | **DRY-RUN** — builds the real task/schema payload, logs it, and returns a simulated `BOOKED` result. **No real calls.** |
| **set**         | **LIVE** — uses `@call-e/calle` to place real outbound phone calls and extracts a structured outcome. |

Start in dry-run (the default) so you can exercise the whole system without
dialing anyone or needing credentials.

---

## API reference

| Method | Path                          | Purpose                                               |
| ------ | ----------------------------- | ----------------------------------------------------- |
| GET    | `/health`                     | Liveness + DB check + CALL-E mode                     |
| GET    | `/api/vehicles`               | List vehicles (with call-job counts)                  |
| GET    | `/api/vehicles/:regnNo`       | One vehicle with its jobs + results                   |
| POST   | `/api/vehicles`               | Create a vehicle (intake)                             |
| PATCH  | `/api/vehicles/:regnNo`       | Update mutable vehicle fields                         |
| GET    | `/api/call-jobs`              | List jobs; filter `?status=&stage=&regnNo=`           |
| GET    | `/api/call-jobs/due`          | Preview jobs currently due (no firing)                |
| POST   | `/api/call-jobs/fire`         | Trigger a firing pass `{respectWindow?,regnNo?,limit?}` |
| GET    | `/api/call-jobs/:id`          | One job with vehicle + result                         |
| POST   | `/api/call-jobs/:id/cancel`   | Cancel a pending job                                  |
| POST   | `/api/close-out`              | Record a completed service → schedule next cycle      |
| GET    | `/api/settings`               | Window config + live distribution across vehicles     |
| PATCH  | `/api/settings`               | Set default window / bulk-apply a window              |

---

## Environment variables

### Backend (`backend/.env`)

| Variable                | Default                                                        | Notes                                        |
| ----------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `DATABASE_URL`          | `postgresql://odosync:odosync@localhost:5432/odosync?schema=public` | Postgres connection string             |
| `PORT`                  | `4000`                                                        | API port                                     |
| `CORS_ORIGIN`           | `http://localhost:3000`                                       | Allowed frontend origin                      |
| `CALLE_API_KEY`         | *(empty)*                                                     | Empty → DRY-RUN; set → live calls            |
| `CALLE_BASE_URL`        | *(unset)*                                                     | Optional CALL-E API base URL override        |
| `SCHEDULER_CRON`        | `* * * * *`                                                   | Cron cadence for the in-process scheduler    |
| `SCHEDULER_ENABLED`     | `true`                                                        | Set `false` to not start the scheduler       |
| `SERVICE_INTERVAL_DAYS` | `180`                                                         | Days from last service to next due date      |

### Frontend (`frontend/.env.local`)

| Variable              | Default                 | Notes                          |
| --------------------- | ----------------------- | ------------------------------ |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Base URL of the backend API    |

---

## Data model (Prisma)

- **Vehicle** — `regnNo` (PK), make/model, owner, phone (E.164), company,
  department, `lastServiceDate`, mileage, `preferredWindow`.
- **CallJob** — one per reminder stage (`FIFTEEN_DAY` / `TEN_DAY` / `FIVE_DAY`),
  with `scheduledFireDate`, `preferredWindow`, and `status`
  (`PENDING` / `FIRED` / `CANCELLED`).
- **CallResult** — one per fired job: `outcome`
  (`BOOKED` / `DECLINED` / `CALLBACK_REQUESTED` / `NO_ANSWER`),
  `proposedAppointmentDate`, `notes`.

See `backend/prisma/schema.prisma` for the authoritative schema, and
[`docs/PRD.md`](docs/PRD.md) for the product rationale.

---

## Repository layout

```
odosync/
├─ backend/           Express API, Prisma, node-cron scheduler, CALL-E wrapper
│  ├─ prisma/         schema.prisma, migrations, seed.ts
│  └─ src/
│     ├─ lib/         prisma, calle, scheduling, http helpers
│     ├─ routes/      vehicles, close-out, call-jobs, settings
│     ├─ scheduler/   run.ts (node-cron)
│     └─ server.ts    Express app + graceful shutdown
├─ frontend/          Next.js App Router (frontend-only)
│  └─ src/
│     ├─ lib/api.ts   typed REST client — the connection layer
│     ├─ components/  IntakeForm, DashboardStats, ActionList (scaffold)
│     └─ app/         dashboard, /intake, /settings
└─ docs/              PRD.md, demo-script.md
```

## Useful scripts

**Backend:** `npm run dev` · `build` · `start` · `typecheck` · `scheduler` ·
`prisma:generate` · `prisma:migrate` · `prisma:deploy` · `db:seed` · `db:reset`

**Frontend:** `npm run dev` · `build` · `start` · `lint`
