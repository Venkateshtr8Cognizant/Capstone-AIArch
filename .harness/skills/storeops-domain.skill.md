# Skill — StoreOps domain

Loaded by the **Planner** (to plan in domain terms) and the **Generator** (to
implement in them). Not loaded by the Evaluator: the sprint contract states the
domain rules for the sprint, and an Evaluator with independent domain knowledge
starts inventing requirements nobody agreed.

---

## What StoreOps is

A REST API for **retail store operations management**. Store teams create
operational programmes, assign and track activities across departments,
coordinate staff, and surface performance reports by store and region.
Everything is scoped to a store; regions aggregate stores.

## The five modules

| Module | Responsibility | Key types |
| --- | --- | --- |
| `activities` | Operational activities — restocking, planogram resets, compliance checks, general store tasks | `Task`, `TaskStatus`, `TaskPriority`, `TaskCategory`, `TaskAuditEntry` |
| `programmes` | Store programmes and their staff membership | `Project`, `ProjectMember`, `ProjectRole`, `ProjectStatus` |
| `staff` | Store staff registration, authentication, profile. **Auth-only — no CRUD surface.** | `User`, `UserProfile`, `StaffRole`, `AuthToken` |
| `alerts` | Notifications triggered by operational events | `Notification`, `NotificationChannel`, `NotificationStatus`, `AlertType` |
| `reports` | Store and regional performance aggregation. **Read-only with respect to every other module.** | `Report`, `ReportType`, `ReportStatus`, `ReportMetrics` |

Every module has the same three layers plus its contract:
`<module>.routes.ts` → `<module>.service.ts` → `<module>.repository.ts`, with
`<module>.types.ts`, optional `<module>.subscribers.ts`, and `index.ts` as the
only file a sibling may import.

## Enumerations — use these exact values

```
TaskStatus          TODO | IN_PROGRESS | DONE | BLOCKED
TaskPriority        LOW | MEDIUM | HIGH | CRITICAL
TaskCategory        RESTOCKING | PLANOGRAM | AUDIT | COMPLIANCE | GENERAL
ProjectRole         STORE_MANAGER | DEPARTMENT_LEAD | ASSOCIATE
ProjectStatus       PLANNING | ACTIVE | CLOSED
StaffRole           REGIONAL_MANAGER | STORE_MANAGER | DEPARTMENT_LEAD | ASSOCIATE
AlertType           INVENTORY | SLA_BREACH | SHIFT_HANDOVER | ESCALATION
NotificationChannel IN_APP | EMAIL
NotificationStatus  PENDING | SENT | READ | FAILED
ReportType          STORE_SUMMARY | REGIONAL_ROLLUP | DEPARTMENT_PERFORMANCE
ReportStatus        PENDING | READY | FAILED
```

## Status transitions

```
Task:     TODO ──▶ IN_PROGRESS ──▶ DONE
           │  └──▶ BLOCKED ◀────┘   (DONE is terminal)
           └────────▶ DONE

Project:  PLANNING ──▶ ACTIVE ──▶ CLOSED   (CLOSED is terminal)
```

`DONE` is terminal by design: reopening completed work corrupts the completion
metrics the reports module aggregates. `BLOCKED` is resumable.

## Authorisation model

`staff` is the auth-only module. Tokens are issued by the client's identity
provider and provisioned into StoreOps; StoreOps stores no credentials. The
platform's `authenticate()` middleware resolves `Authorization: Bearer <token>`
to a `Principal` via `StaffReadPort.resolveToken`, and that is the **only**
place a token becomes an identity.

```ts
type Principal = {
  userId: string; storeId: string; regionId: string;
  role: StaffRole; departmentId: string | null;
};
```

Authorise against the `Principal`, never against a body field. A body that
says `"role": "STORE_MANAGER"` is an assertion by the caller, not a fact.

Who may change an activity's status (`BR-7`): the assignee; the
`DEPARTMENT_LEAD` of the activity's department; or a `STORE_MANAGER` /
`REGIONAL_MANAGER` of the activity's store. Deleting an activity is narrower:
its creator, or a store/regional manager.

**Store isolation is absolute.** An entity in another store is reported as
404, not 403 — even to a regional manager — so the API does not leak the
existence of other stores' data.

## API surface

The nine base endpoints of specification 3.6, plus two documented extensions:

| Method + path | Module | Notes |
| --- | --- | --- |
| `GET /api/activities` | activities | optional `programmeId`, `status` filters |
| `POST /api/activities` | activities | |
| `GET /api/activities/:id` | activities | |
| `PATCH /api/activities/:id` | activities | status, priority, category, assignee |
| `DELETE /api/activities/:id` | activities | creator or store manager only |
| `GET /api/programmes` | programmes | authenticated store only |
| `POST /api/programmes` | programmes | |
| `POST /api/programmes/:id/members` | programmes | |
| `GET /api/alerts` | alerts | authenticated user only |
| `PATCH /api/activities/bulk-status` | activities | **extension** — shift handover (spec 3.4 feature 1) |
| `POST /api/programmes/:id/close` | programmes | **extension** — required by the spec 3.3 cross-module example |

`GET /health` is unauthenticated. `reports` has no base endpoint; the regional
rollup (`GET /api/reports/region/:id`) is backlog item **F-3**.

## Cross-module behaviour that already exists

Use these as the pattern for anything new:

| Trigger | Event | Reaction |
| --- | --- | --- |
| A `HIGH`/`CRITICAL` activity moves to `BLOCKED` | `activities.task.status_changed` | `alerts.blocked-escalation` raises an `ESCALATION` email to the department lead, falling back to a store manager |
| A shift handover completes | `activities.bulk_status.completed` | `alerts.handover-summary` raises a `SHIFT_HANDOVER` in-app alert per store manager; `reports.store-summary-on-handover` recomputes the `STORE_SUMMARY` |
| A programme closes | `programmes.programme.closed` | `reports.store-summary-on-close` recomputes the `STORE_SUMMARY` |

## Backlog (specification 3.4)

Feature 1, the shift handover bulk update, is **built** — it was the
demonstration run. The rest are candidates for future harness runs:

- **F-2 — SLA breach alerting.** When a `HIGH`/`CRITICAL` activity passes
  `dueAt` without reaching `DONE`, fire `SLA_BREACH` to the assigned
  department lead and escalate to `STORE_MANAGER` if unresolved after a
  configurable grace period. Needs a scheduled job, so it has a third sprint.
- **F-3 — regional rollup report.** `GET /api/reports/region/:id` aggregating
  completion rates, overdue counts by `TaskCategory`, and blocked activity
  lists across all stores in a region, triggering a `REGIONAL_ROLLUP` record
  via the event bus. Requires cross-store reads, so the store-isolation rule
  needs an explicit, narrow exception for `REGIONAL_MANAGER`.
- **F-4 — planogram task template.** `POST /api/programmes/:id/templates` to
  clone a standard set of `PLANOGRAM` activities into a new programme, applying
  department assignments and default priorities from the template definition.
- **F-5 — escalate HIGH/CRITICAL activities blocked during a handover.**
  Found by the smoke run, not by the gate. `alerts.blocked-escalation`
  subscribes to `activities.task.status_changed`, which the bulk path does not
  emit — it emits `activities.bulk_status.completed`. So blocking a `CRITICAL`
  activity via `PATCH /api/activities/:id` escalates to the department lead,
  and blocking the same activity in a shift handover does not. The handover
  summary is raised either way, so nothing looks broken.

  This is a genuine behavioural inconsistency, and it is worth understanding
  why no check caught it: `EV-1` proved the event is published, `TQ-7` proved
  every contract rule is asserted, and the Evaluator confirmed the payload
  carries the routing fields a subscriber needs. All three were satisfied.
  What none of them can know is that *a second subscriber should have been
  interested*. Deciding which events a module ought to care about is
  architectural intent, and it stays with the developer.

  Fix when scheduled: have `alerts.handover-summary` also raise an
  `ESCALATION` per blocked `HIGH`/`CRITICAL` item — the payload already
  carries `priority` and `departmentId` for exactly this — rather than making
  the bulk path emit per-item `status_changed` events, which would multiply
  events and break BR-10's "exactly one event" guarantee.

## Domain vocabulary

Say *activity* in API and domain language, not "task", even though the type is
called `Task` — that is the client's language and it appears in their UI.
*Colleague* means a member of store staff. A *programme* is a body of work
(`Project` in code); *department* is a store area (grocery, chilled).
