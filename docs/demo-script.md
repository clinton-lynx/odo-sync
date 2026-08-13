# OdoSync — Demo Script

A ~5-minute walkthrough that shows the whole system working end-to-end in
**DRY-RUN** mode (no real phone calls). It exercises intake → scheduling →
firing → outcomes → close-out.

> Assumes PostgreSQL is reachable and `backend/.env` is configured. All calls are
> simulated because `CALLE_API_KEY` is empty.

---

## 0. One-time setup

```bash
cd backend
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run db:seed          # loads 7 demo vehicles across the 15/10/5-day windows
```

```bash
cd ../frontend
npm install
cp .env.local.example .env.local
```

## 1. Start both servers

```bash
# Terminal 1
cd backend && npm run dev        # API + scheduler on :4000

# Terminal 2
cd frontend && npm run dev       # UI on :3000
```

Health check:

```bash
curl http://localhost:4000/health
# => {"ok":true,"db":"up","calle":"dry-run", ...}
```

Open <http://localhost:3000> — the dashboard shows vehicle count and calls due.

---

## 2. Show what's due

The seed backdates several vehicles so their 15/10/5-day calls are due today.

```bash
curl http://localhost:4000/api/call-jobs/due | jq 'length'      # e.g. 6
```

In the UI: the **Due now** section lists them (reg no · stage · window).

---

## 3. Fire the reminder calls (dry-run)

Trigger a firing pass. `respectWindow:false` bypasses the time-of-day check so
the demo works at any hour.

```bash
curl -X POST http://localhost:4000/api/call-jobs/fire \
  -H 'Content-Type: application/json' -d '{"respectWindow":false}' | jq
# => {"checked":6,"fired":6,"skippedWindow":0,"failed":0,"results":[...]}
```

Or click **"Fire due calls (dry-run)"** in the UI.

Confirm the queue drained and results were written:

```bash
curl http://localhost:4000/api/call-jobs/due | jq 'length'      # => 0
curl http://localhost:4000/api/vehicles/KA01AB1234 | jq '.callJobs[] | {stage, status, outcome: .result.outcome}'
```

Each fired job now has status `FIRED` and a `CallResult` with a simulated
`BOOKED` outcome + proposed appointment date.

---

## 4. New vehicle intake

Add a vehicle via the API (or the **Intake** page in the UI):

```bash
curl -X POST http://localhost:4000/api/vehicles \
  -H 'Content-Type: application/json' -d '{
    "regnNo":"KA10ZZ4321",
    "makeModel":"Skoda Slavia",
    "ownerName":"Meera Joshi",
    "phoneNumber":"+919000112233",
    "lastServiceDate":"2026-03-01",
    "preferredWindow":"AFTERNOON"
  }' | jq
```

---

## 5. Close out a service → schedule the next cycle

Record a completed service. This advances the last-service date, cancels stale
pending jobs, and schedules the next 15/10/5-day calls off the new due date:

```bash
curl -X POST http://localhost:4000/api/close-out \
  -H 'Content-Type: application/json' -d '{"regnNo":"KA10ZZ4321","mileage":22000}' | jq \
  '{nextDueDate, createdJobs: [.createdJobs[] | {stage, scheduledFireDate}]}'
```

You'll see three fresh `PENDING` jobs dated ~15/10/5 days before the new due date
(`lastServiceDate + SERVICE_INTERVAL_DAYS`).

---

## 6. Settings

Show window configuration and the live distribution of vehicles across windows:

```bash
curl http://localhost:4000/api/settings | jq
```

Change the default intake window (also available on the **Settings** page):

```bash
curl -X PATCH http://localhost:4000/api/settings \
  -H 'Content-Type: application/json' -d '{"defaultWindow":"EVENING"}' | jq
```

---

## 7. (Optional) Show the scheduler firing on its own

The in-process scheduler fires due calls automatically, but only inside each
vehicle's preferred window. To watch it tick without waiting for the clock, run
it standalone with a fast cadence:

```bash
cd backend
SCHEDULER_CRON="*/5 * * * * *" npm run scheduler
# logs: [scheduler] checked=N fired=... skippedWindow=... every 5 seconds
```

(Re-run `npm run db:seed` first to restock due jobs.)

---

## Talking points

- **No self-HTTP:** the scheduler calls the same internal `fireDueCallJobs()`
  the `/fire` endpoint uses — one code path, two triggers.
- **Safe by default:** DRY-RUN means the entire flow is demoable without dialing
  anyone; setting `CALLE_API_KEY` flips it to real calls.
- **One connection layer:** the frontend touches the backend only through
  `frontend/src/lib/api.ts`.
