# Sprint 2 contract — shift handover bulk status update

## Scope

**In:**

- `src/contracts/events.ts` — `activities.bulk_status.completed` added to
  `StoreOpsEventMap` and `EVENT_OWNERS`, with `BulkStatusCompletedPayload`.
- `src/modules/activities/activities.service.ts` — publish exactly one
  `activities.bulk_status.completed` after the batch write succeeds.
- `src/modules/activities/activities.routes.ts` — `PATCH /api/activities/bulk-status`,
  registered before `PATCH /api/activities/:id`, with a zod schema mirroring
  BR-1 and BR-2.
- `src/modules/alerts/alerts.subscribers.ts` — `alerts.handover-summary`:
  raise a `SHIFT_HANDOVER` notification per store manager.
- `src/modules/reports/reports.subscribers.ts` —
  `reports.store-summary-on-handover`: request and generate a `STORE_SUMMARY`.
- `tests/integration/bulk-status.api.test.ts` — the endpoint end to end,
  including the cross-module effects observed through public surfaces.

**Out:**

- Any change to the rule logic agreed in sprint 1. If a rule turns out to be
  wrong, that is an escalation, not a quiet edit.
- Notification delivery (email/in-app dispatch) — downstream concern.
- `GET /api/reports/...` — backlog F-3.

## Carried-in work

From sprint 1's PASS: none. Sprint 1 passed on its first iteration with no
required follow-ups.

## Business rules in this sprint

| Rule | Statement | Enforced where | Outcome when violated |
| --- | --- | --- | --- |
| BR-10 | Exactly one `activities.bulk_status.completed` is published, after the write, listing only activities that changed | `ActivityService.bulkUpdateStatus` | gate `EV-1`, `EV-7`; test asserts count and payload |
| BR-11 | Alert and report state changes occur only in the `alerts` and `reports` subscribers; `activities` writes neither | subscribers | gate `MB-1`, `MB-6`, `EV-5`; test asserts effects via public API |
| BR-1 … BR-9 | Re-verified through the HTTP surface with correct status codes and rule ids | routes + service | per the API conventions table below |

### HTTP outcome table (re-verification of sprint 1 rules)

| Condition | Status | Body |
| --- | --- | --- |
| ≥ 1 item updated | 200 | `data.updated[]`, `data.failed[]`, counts |
| Batch > 50, or `targetStatus` not in enum | 400 | `error.code: VALIDATION_FAILED`, `details[0].path` |
| Duplicate ids (BR-1) | 422 | `error.rule: 'BR-1'` |
| `BLOCKED` without note (BR-3) | 422 | `error.rule: 'BR-3'`, `details[0].path: 'note'` |
| No item updatable (BR-9) | 422 | `error.rule: 'BR-9'`, `details[]` with each item's rule |
| No/invalid bearer token | 401 | `error.code: NOT_AUTHENTICATED` |

## Acceptance criteria

### AC-1 — the endpoint applies a batch and emits one event (BR-10)

- **GIVEN** two `TODO` activities on the caller's store and the header
  `x-correlation-id: corr_api_1`
- **WHEN** `PATCH /api/activities/bulk-status` is called with both ids and
  `targetStatus: 'DONE'`
- **THEN** the response is 200 with `updatedCount: 2`, `failedCount: 0`, and
  every entry in `data.updated` has `status: 'DONE'`
- **AND** exactly one `activities.bulk_status.completed` event exists, its
  `payload.updated` has two entries, and its `correlationId` is `corr_api_1`
- **AND** `GET /api/activities?status=DONE` returns both activities

### AC-2 — partial failure is reported in a 200 (BR-4, BR-7)

- **GIVEN** three ids: one the caller may update, one belonging to another
  department the caller does not lead, and one that does not exist
- **WHEN** the endpoint is called by an `ASSOCIATE`
- **THEN** the response is 200 with `updatedCount: 1`
- **AND** `data.failed` contains an entry with `code: 'NOT_PERMITTED'`,
  `rule: 'BR-7'` and one with `code: 'ACTIVITY_NOT_FOUND'`, `rule: 'BR-4'`
- **AND** `GET /api/activities/:id` for the rejected activity still reports
  `status: 'TODO'`

### AC-3 — an all-failed batch returns 422 naming the rule (BR-9)

- **GIVEN** a batch of two non-existent ids
- **WHEN** the endpoint is called
- **THEN** the response is 422 with `error.code: 'BUSINESS_RULE_VIOLATION'`,
  `error.rule: 'BR-9'`, and `error.details[]` containing both `BR-9` and `BR-4`
- **AND** no `activities.bulk_status.completed` event is published

### AC-4 — BLOCKED without a note is refused (BR-3)

- **GIVEN** a valid activity id
- **WHEN** the endpoint is called with `targetStatus: 'BLOCKED'` and no note
- **THEN** the response is 422 with `error.rule: 'BR-3'` and
  `details[0].path: 'note'`
- **AND** the activity is still `TODO`

### AC-5 — schema bounds are enforced at the edge (BR-1, BR-2)

- **GIVEN** a batch of 51 ids, or `targetStatus: 'IN_PROGRESS'`
- **WHEN** the endpoint is called
- **THEN** the response is 400 with `error.code: 'VALIDATION_FAILED'` and
  `details[0].path` naming `taskIds` or `targetStatus` respectively

### AC-6 — duplicates are refused with the rule id (BR-1)

- **GIVEN** the same activity id twice in one batch
- **WHEN** the endpoint is called
- **THEN** the response is 422 with `error.rule: 'BR-1'` and no event is
  published

### AC-7 — the endpoint requires authentication

- **GIVEN** no `Authorization` header
- **WHEN** the endpoint is called
- **THEN** the response is 401 with `error.code: 'NOT_AUTHENTICATED'` and no
  event is published

### AC-8 — cross-store items are refused even for that store's manager (BR-5)

- **GIVEN** an activity in `store_401` and a `STORE_MANAGER` principal of
  `store_902`
- **WHEN** the endpoint is called with that id
- **THEN** the response is 422 with `error.rule: 'BR-9'` and `details[]`
  containing `BR-5`
- **AND** the activity is unchanged

### AC-9 — alerts raises a handover summary via the bus (BR-11)

- **GIVEN** a successful single-activity handover to `DONE`
- **WHEN** the store manager calls `GET /api/alerts`
- **THEN** exactly one notification is returned with `type: 'SHIFT_HANDOVER'`,
  `channel: 'IN_APP'`, `status: 'PENDING'`, and a subject naming the count and
  target status
- **AND** the notification was created by the `alerts.handover-summary`
  subscriber, not by the activities module

### AC-10 — reports recomputes the store summary via the bus (BR-11)

- **GIVEN** two activities on the store, one of which is handed over to `DONE`
- **WHEN** the handover completes
- **THEN** the latest `STORE_SUMMARY` report for the store has
  `status: 'READY'` with `totalActivities: 2`, `completedActivities: 1`,
  `completionRate: 0.5`

### AC-11 — the subscriber wiring is asserted, not assumed (BR-11)

- **GIVEN** a built application
- **WHEN** the subscribers of `activities.bulk_status.completed` are inspected
- **THEN** they are exactly `['alerts.handover-summary',
  'reports.store-summary-on-handover']`

## Files expected to change

| File | Purpose | Criteria served |
| --- | --- | --- |
| `src/contracts/events.ts` | event type, owner, payload | AC-1, AC-11 |
| `src/modules/activities/activities.service.ts` | publish after write | AC-1, AC-3 |
| `src/modules/activities/activities.routes.ts` | new endpoint + schema | AC-1…AC-8 |
| `src/modules/alerts/alerts.subscribers.ts` | handover summary | AC-9, AC-11 |
| `src/modules/reports/reports.subscribers.ts` | summary recompute | AC-10, AC-11 |
| `tests/integration/bulk-status.api.test.ts` | new — endpoint and effects | AC-1…AC-11 |

## Definition of done

- `npm run gate:full` is PASS with zero blocking findings.
- Every acceptance criterion MET with file:line or test-name evidence.
- Every rule id in `active-rules.sprint-2.json` asserted by a test that
  provokes it.
- Coverage thresholds hold.
- No changes to the sprint-1 rule logic.

