# OdoSync — Product Requirements Document

## 1. Problem

Fleet operators lose money and uptime when scheduled vehicle servicing slips.
Reminders sent by SMS or email are easy to ignore, and manually phoning every
owner ahead of each service doesn't scale. Service centres want the *booking*
made, not just a notification sent.

## 2. Solution

OdoSync proactively **calls** each vehicle owner ahead of their next service due
date and tries to **book the appointment on the call**, using CALL-E's AI
calling. Each vehicle gets an escalating sequence of three reminder calls, and
every call's outcome is recorded so staff can see exactly what's booked, what
needs a callback, and what was declined.

## 3. Goals

- Automatically schedule and place reminder calls at **15, 10, and 5 days**
  before a vehicle's next service is due.
- Respect each owner's **preferred call window** (morning / afternoon / evening).
- Capture a **structured outcome** for every call.
- Make **closing out** a completed service trivially roll the vehicle into its
  next reminder cycle.
- Run safely without real telephony (DRY-RUN) until credentials are added.

### Non-goals (for this iteration)

- Rich/polished UI (the current frontend is a wiring scaffold).
- Multi-tenant auth / RBAC.
- Payment or invoicing.
- Two-way SMS or email channels.
- A persistent per-user settings store (window prefs live on each vehicle).

## 4. Users

- **Service advisor / front desk** — sees who's due, what's booked, and can
  trigger or cancel calls; does intake for new vehicles.
- **Fleet/ops manager** — monitors coverage across the fleet and call outcomes.

## 5. Core flows

### 5.1 Intake

A vehicle is registered with its owner, phone (E.164), last service date/mileage,
and a preferred call window. → `POST /api/vehicles`.

### 5.2 Scheduling

The next service is due `SERVICE_INTERVAL_DAYS` (default **180**) after the last
service. Three `CallJob`s are created at **due − 15**, **due − 10**, and
**due − 5** days. → `createCallJobsForVehicle()` (invoked at close-out).

### 5.3 Firing calls

A `node-cron` job in the backend runs `fireDueCallJobs()` on a schedule. For each
due, `PENDING` job whose preferred window matches the current hour, it places
(or simulates) the call, writes a `CallResult`, and marks the job `FIRED`.

- **15-day** call: soft heads-up.
- **10-day** call: push to pick a slot.
- **5-day** call: final, urgent reminder.

### 5.4 Close-out

When a service is completed, staff record it. This advances `lastServiceDate`
(and mileage), cancels any outstanding pending jobs, and schedules the next
cycle's three calls. → `POST /api/close-out`.

## 6. Scheduling rules

| Rule                   | Value                                                       |
| ---------------------- | ----------------------------------------------------------- |
| Service interval       | `SERVICE_INTERVAL_DAYS` days after last service (default 180) |
| Reminder stages        | 15, 10, 5 days before due                                   |
| MORNING window         | 08:00–12:00 (local)                                         |
| AFTERNOON window       | 12:00–17:00 (local)                                         |
| EVENING window         | 17:00–20:00 (local)                                         |
| Window enforcement     | On by default in the scheduler; can be bypassed for manual/demo firing |

## 7. Data model

- **Vehicle** (`regnNo` PK) → has many **CallJob**.
- **CallJob** (stage, `scheduledFireDate`, `preferredWindow`, status) → has one
  **CallResult**.
- **CallResult** (outcome, `proposedAppointmentDate`, notes).

Enums: `CallWindow` (MORNING/AFTERNOON/EVENING), `CallStage`
(FIFTEEN_DAY/TEN_DAY/FIVE_DAY), `CallJobStatus` (PENDING/FIRED/CANCELLED),
`CallOutcome` (BOOKED/DECLINED/CALLBACK_REQUESTED/NO_ANSWER).

## 8. Integrations

- **CALL-E** (`@call-e/calle`, Node ≥ 22): the backend builds a per-stage call
  task and a JSON result schema, calls `client.calls.createAndWait(...)`, and
  normalizes the structured result into a `CallResult`. With no API key it runs
  in DRY-RUN and simulates the call.
- **PostgreSQL** via Prisma.

## 9. Success metrics (illustrative)

- % of due services with at least one completed reminder call.
- Booking rate per stage (are 5-day calls converting?).
- Reduction in overdue services across the fleet.

## 10. Tech stack

Frontend: Next.js (App Router) + TypeScript + Tailwind (frontend-only).
Backend: Node.js + TypeScript + Express (ESM). ORM: Prisma. DB: PostgreSQL.
Scheduler: node-cron (in-process). Calling: CALL-E.
