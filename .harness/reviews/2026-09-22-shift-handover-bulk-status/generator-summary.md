# Generator summary — sprint 2, iteration 2

## Feedback resolution

| Finding | Rule | What changed | How verified |
| --- | --- | --- | --- |
| B-1 sibling repository import | `MB-1`, `MB-6`, `EV-5` | Deleted both alerts imports and the `alertRepository`/`alertService` fields from `ActivityService`. Created `src/modules/alerts/alerts.subscribers.ts` with `alerts.handover-summary`, registered from `createAlertsModule`. Recipients resolved via `StaffReadPort.listStoreManagers`. | `npm run gate` → 0 `MB-*`/`EV-5` findings. `bulk-status.api.test.ts` → "raises a SHIFT_HANDOVER alert to the store manager through the event bus (BR-11)" asserts the notification via `GET /api/alerts`, so it can only exist if the subscriber ran. |
| B-2 declared event never published | `EV-1` | `bulkUpdateStatus` now publishes exactly one `activities.bulk_status.completed` after `saveMany` returns. Payload carries `priority`, `category`, `departmentId`, `assigneeId` per item so subscribers never call back into activities. | `activities.service.test.ts` → "publishes exactly one bulk event listing only the activities that changed (BR-10)" asserts length 1, the `updated[]` ids, `failedCount`, and the propagated `correlationId`. |
| B-3 raw `Error` throws | `EH-1` | Both guards deleted. The service now calls `planBulkStatusUpdate` and throws `BusinessRuleError(primaryRule, …)` with every rejection and item failure in `details[]`. | `npm run gate` → 0 `EH-*`. `activities.service.test.ts` → "raises a typed BusinessRuleError naming the rule and every item failure (BR-9)" asserts `rule`, `statusCode` 422, `code`, `correlationId` and the sorted `details[].rule` list. |
| B-4 hand-rolled error responses | `EH-4` | All three removed. The route uses `parseBody(bulkStatusSchema, …)` and `route()`; the try/catch is gone, so `errorHandler` owns every error response. | `npm run gate` → 0 `EH-4`. `bulk-status.api.test.ts` asserts the envelope: `error.code`, `error.rule`, `error.details[].path`. |
| B-5 status-code-only tests | `TQ-2`, `TQ-3` | Rewrote the integration suite: 11 cases, each asserting the business outcome alongside the status — response body fields, the emitted event, persisted state re-read through the API, and `error.rule` on every 422. | `npm run gate` → 0 `TQ-*`. |
| B-6 no rule traceability | `TQ-7` | Every rule in `active-rules.sprint-2.json` now has a test that provokes it and names it. BR-10/BR-11 are post-conditions, so they are named in test titles and asserted by event count and subscriber list. | `npm run gate` → 0 `TQ-7`. |
| B-7 sprint-1 rules reimplemented and partly lost | BR-1, BR-6…BR-9 | Deleted the inline item loop. `bulkUpdateStatus` calls `planBulkStatusUpdate` and acts on `rejections`/`accepted`/`failed`. Audit entry appended per accepted item via `appendAudit`. BR-7 permission check restored (it comes from the rule function), duplicates detected, BR-9 guard back. | Sprint 1's 29 rule tests pass unchanged against the shared rule function — the drift is structurally impossible now, because there is one implementation. |

**On B-7, for the record:** reimplementing the item loop rather than calling
the agreed rule function was the root cause of five of the seven findings. The
permission check (BR-7) disappearing was the most serious consequence: any
authenticated colleague could have closed any activity in their store. The rule
function from sprint 1 had a test for exactly that case; the inline copy did
not, because the copy came with no tests of its own.

## Acceptance-criteria self-check

| Criterion | Rule | Status | Evidence |
| --- | --- | --- | --- |
| AC-1 endpoint applies a batch and emits one event | BR-10 | MET | `bulk-status.api.test.ts` → "returns 200, updates the batch, and emits one bulk event" — asserts `updatedCount: 2`, both statuses `DONE`, exactly 1 event, `correlationId: 'corr_api_1'`, and `GET /api/activities?status=DONE` returning 2 |
| AC-2 partial failure reported in a 200 | BR-4, BR-7 | MET | "returns 200 with per-item failures when part of the batch is rejected" — `updatedCount: 1`, `failed[]` containing `{ code: 'NOT_PERMITTED', rule: 'BR-7' }` and `{ code: 'ACTIVITY_NOT_FOUND', rule: 'BR-4' }`, plus a re-read proving the rejected activity is still `TODO` |
| AC-3 all-failed batch returns 422 | BR-9 | MET | "returns 422 naming the rule when no item could be updated (BR-9)" — `error.rule: 'BR-9'`, `details[]` containing `BR-9` and `BR-4`, and 0 events |
| AC-4 BLOCKED without a note refused | BR-3 | MET | "returns 422 when BLOCKED is requested without a note (BR-3)" — `error.rule: 'BR-3'`, `details[0]: { path: 'note', rule: 'BR-3' }`, activity still `TODO` |
| AC-5 schema bounds at the edge | BR-1, BR-2 | MET | "returns 400 with field detail when the batch exceeds the schema ceiling (BR-1)" and "returns 400 when the target status is not DONE or BLOCKED (BR-2)" |
| AC-6 duplicates refused with the rule id | BR-1 | MET | "returns 422 with duplicate ids in the batch (BR-1)" — `error.rule: 'BR-1'`, 0 events |
| AC-7 endpoint requires authentication | — | MET | "returns 401 without a bearer token and changes nothing" — `error.code: 'NOT_AUTHENTICATED'`, 0 events |
| AC-8 cross-store refused for every role | BR-5 | MET | "refuses an activity from another store even for that store's manager (BR-5)" — `error.rule: 'BR-9'` with `BR-5` in `details[]`, activity unchanged |
| AC-9 alerts raises a handover summary | BR-11 | MET | "raises a SHIFT_HANDOVER alert to the store manager through the event bus (BR-11)" — `GET /api/alerts` returns one `{ type: 'SHIFT_HANDOVER', channel: 'IN_APP', status: 'PENDING' }` whose subject names the count and target status |
| AC-10 reports recomputes the store summary | BR-11 | MET | "recomputes the store summary report through the event bus (BR-11)" — latest `STORE_SUMMARY` is `READY` with `totalActivities: 2, completedActivities: 1, completionRate: 0.5` |
| AC-11 subscriber wiring asserted | BR-11 | MET | `activities.service.test.ts` → "hands alerts and reports work to their own subscribers, never writing their state (BR-11)" asserts `subscribersOf('activities.bulk_status.completed')` equals `['alerts.handover-summary', 'reports.store-summary-on-handover']` |

Every evidence cell names a test. Nothing is marked MET without one.

## Files changed

| File | Change | Why |
| --- | --- | --- |
| `src/contracts/events.ts` | `activities.bulk_status.completed` + `BulkStatusCompletedPayload` | BR-10. Payload carries the routing fields subscribers need. |
| `src/modules/activities/activities.service.ts` | calls `planBulkStatusUpdate`; appends audit; publishes after the write | B-2, B-3, B-7; BR-8, BR-10 |
| `src/modules/activities/activities.routes.ts` | `PATCH /api/activities/bulk-status` before `/activities/:id`; zod schema from `MAX_BULK_BATCH_SIZE` and `BULK_TARGET_STATUSES` | AC-1…AC-8. No hand-rolled error responses. |
| `src/modules/alerts/alerts.subscribers.ts` | new — `alerts.handover-summary` | B-1, BR-11 |
| `src/modules/alerts/index.ts` | registers subscribers in the module factory | The module owns both sides of its state |
| `src/modules/reports/reports.subscribers.ts` | new — `reports.store-summary-on-handover` | AC-10, BR-11 |
| `tests/integration/bulk-status.api.test.ts` | rewritten — 11 cases | B-5, B-6 |
| `tests/unit/activities.service.test.ts` | bulk event and subscriber assertions | AC-11, BR-10 |

## Gate result

```
$ npm run gate:full
GATE VERDICT: PASS  (blocking 0, advisory 4)

[PASS] boundaries    scanned 44 file(s)   no violations
[PASS] errors        scanned 38 file(s)   no violations
[PASS] test-quality  scanned 6 file(s)    no violations
[PASS] events        scanned 38 file(s)   4 advisory
[PASS] typecheck                          (11.5s)
[PASS] tests+coverage                     (21.7s)
```

| | Blocking | Advisory |
| --- | --- | --- |
| F1 boundaries | 0 | 0 |
| F2 errors | 0 | 0 |
| F3 test quality | 0 | 0 |
| F4 events | 0 | 4 |

The four advisories are all `EV-6` — an event published with no in-process
subscriber: `activities.task.created`, `programmes.member.added`,
`alerts.notification.created`, `reports.report.requested`. Each is a
deliberate downstream channel rather than a missing consumer, and none relates
to this sprint's work. Left in place so the Monitor can watch the count.

Coverage: overall 93.2% lines, all service files ≥87.6%, all route files 100%.
101 tests (72 unit, 29 integration).

## Known gaps

None affecting the contract. Two things a future sprint should pick up:

1. `EV-6` advisories now number four. If the count keeps growing, the
   catalogue is accumulating channels nobody consumes, and each is a place
   where a subscriber was *supposed* to be — the F4 pattern in slow motion.
2. The permission rule `mayUpdate` is now shared by the bulk path and the
   single `PATCH /api/activities/:id`, which resolves the drift risk the sprint-1
   summary raised. The `patch()` method still duplicates the BR-3 note check,
   though — one small consolidation left.

## Out-of-scope observations

`BulkStatusCompletedPayload.updated[]` carries four routing fields for the
alerts subscriber's benefit. If a third consumer needs different fields, the
payload should not simply grow — that would couple every consumer to the union
of everyone's needs. The right move at that point is a second, narrower event.

