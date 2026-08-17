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
- Keep workshop identity and service context editable without a backend restart.
- Preserve CALL-E task, provider-call, attempt-status, and failure diagnostics.
- Make **closing out** a completed service trivially roll the vehicle into its
  next reminder cycle.
- Run safely without real telephony (DRY-RUN) until credentials are added.

### Non-goals (for this iteration)

- Multi-tenant auth / RBAC.
- Payment or invoicing.
- Two-way SMS or email channels.
- Per-user accounts or preferences; call-window preferences live on vehicles.
- Automatic retry policies beyond the scheduled 15/10/5-day reminder stages.

## 4. Users

- **Service advisor / front desk** — sees who's due, what's booked, and can
  trigger or cancel calls; does intake for new vehicles.
- **Fleet/ops manager** — monitors coverage across the fleet and call outcomes.

## 5. Core flows

### 5.1 Intake

A vehicle is registered with its owner, phone, last service date/mileage, and a
preferred call window. Nigerian local numbers are normalized to `+234` E.164
format before being sent to CALL-E. → `POST /api/vehicles`.

### 5.2 Scheduling

The next service is due `SERVICE_INTERVAL_DAYS` (default **180**) after the last
service. Three `CallJob`s are created at **due − 15**, **due − 10**, and
**due − 5** days. → `createCallJobsForVehicle()` (invoked at close-out).

### 5.3 Firing calls

A `node-cron` job in the backend runs `fireDueCallJobs()` on a schedule. For each
due, `PENDING` job whose preferred window matches the current hour, it places
(or simulates) the call, writes a `CallResult`, and marks the job `FIRED`.

Staff can also select **Call now** for one pending job. This uses the same
internal firing path but targets the selected job immediately, including before
its scheduled date. Individual pending jobs can be cancelled from Activity.

- **15-day** call: soft heads-up.
- **10-day** call: push to pick a slot.
- **5-day** call: final, urgent reminder.

### 5.4 Close-out

When a service is completed, staff record it. This advances `lastServiceDate`
(and mileage), cancels any outstanding pending jobs, and schedules the next
cycle's three calls. → `POST /api/close-out`.

Before a close-out is submitted, the UI previews the next due date and all three
reminder dates that will be created.

### 5.5 Workshop settings

Staff can edit the workshop business name, address, operating hours, service
description, and callback phone number. These values are stored in the singleton
`WorkshopSettings` row and are read immediately when the next CALL-E task is
built. → `GET/PATCH /api/settings`.

The settings screen also exposes the default intake window, each vehicle's
preferred window, and the current distribution across morning, afternoon, and
evening windows.

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
- **CallResult** (outcome, proposed appointment, notes, CALL-E task ID, provider
  call ID, provider attempt status, and provider failure code/message).
- **WorkshopSettings** (singleton workshop identity and service context).

Enums: `CallWindow` (MORNING/AFTERNOON/EVENING), `CallStage`
(FIFTEEN_DAY/TEN_DAY/FIVE_DAY), `CallJobStatus` (PENDING/FIRED/CANCELLED),
`CallOutcome` (BOOKED/DECLINED/CALLBACK_REQUESTED/NO_ANSWER).

## 8. Integrations

- **CALL-E** (`@call-e/calle`, Node ≥ 22): the backend builds a per-stage call
  task and a JSON result schema, calls `client.calls.createAndWait(...)`, and
  normalizes the structured result into a `CallResult`. With no API key it runs
  in DRY-RUN and simulates the call.
- Nigerian `+234` recipients include explicit `region: "NG"` and
  `locale: "en-NG"` routing metadata.
- Call scripts confirm the owner's name, include the current workshop profile
  and date, preserve distinct 15/10/5-day tones, and ask for the customer's
  preferred appointment date/time rather than treating their call window as an
  appointment slot.
- **PostgreSQL** via Prisma.

## 9. Success metrics (illustrative)

- % of due services with at least one completed reminder call.
- Booking rate per stage (are 5-day calls converting?).
- Reduction in overdue services across the fleet.

## 10. Tech stack

Frontend: Next.js (App Router) + TypeScript + Tailwind (frontend-only).
Backend: Node.js + TypeScript + Express (ESM). ORM: Prisma. DB: PostgreSQL.
Scheduler: node-cron (in-process). Calling: CALL-E.

## 11. Deployment

- **Frontend:** Next.js on Vercel — <https://odosync.vercel.app>
- **Backend:** persistent Express service on Railway —
  <https://odosync-backend-production.up.railway.app>
- **Database:** Railway PostgreSQL.

The Railway deployment applies Prisma migrations before starting the API and
uses `/health` for deployment health checks. The Vercel build receives the
public Railway API URL through `NEXT_PUBLIC_API_URL`, while Express CORS permits
the production Vercel origin.

The public deployment keeps CALL-E in DRY-RUN mode and the autonomous scheduler
disabled because the seeded fleet contains fictional placeholder contacts.

## 12. Acceptance and verification

- Intake creates a vehicle that can participate in reminder scheduling.
- Close-out cancels stale pending jobs and creates exactly three new jobs.
- Scheduler/manual firing writes a result and changes the job from `PENDING` to
  `FIRED`; cancellation changes an eligible job to `CANCELLED`.
- Workshop edits persist and affect the next generated CALL-E task without a
  restart.
- Activity exposes structured outcomes and provider diagnostics.
- Backend health reports API, database, and CALL-E mode status.
- Backend tests, TypeScript typecheck, and production build pass.
- Frontend lint and production build pass.

Current automated coverage includes nine backend tests for Nigerian number
normalization/routing, call-task content, identity confirmation, appointment
wording, stage-specific tone, optional workshop facts, and live settings refresh.
