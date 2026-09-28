# Generator summary — sprint 1, iteration 1

## Acceptance-criteria self-check

| Criterion | Rule | Status | Evidence |
| --- | --- | --- | --- |
| AC-1 valid batch planned in full | BR-1, BR-6 | MET | `bulk-status.rules.test.ts` → "accepts a valid batch and plans one write per activity" |
| AC-2 batch bounds | BR-1 | MET | three cases: "rejects an empty batch", "rejects a batch over the 50-item ceiling", "rejects duplicate ids in one batch" |
| AC-3 only DONE/BLOCKED | BR-2 | MET | "rejects a target status other than DONE or BLOCKED" |
| AC-4 blocking requires a reason | BR-3 | MET | "requires a note when blocking work", "accepts a blocking request that carries a note", "treats a whitespace-only note as missing" |
| AC-5 request failure short-circuits items | BR-1, BR-3 | MET | "does not evaluate items when the request itself is invalid" — asserts `failed` is empty |
| AC-6 per-item failures isolated | BR-4, BR-5, BR-6, BR-7 | MET | "reports every item failure in one pass so a batch can be fixed in one round trip" — `accepted` 1, rules `['BR-4','BR-5','BR-6']` |
| AC-7 permission rule exhaustive | BR-7 | MET | `describe('mayUpdate (BR-7)')` — six cases including the no-department case |
| AC-8 cross-store refused for every role | BR-5 | MET | "refuses a cross-store activity even for a regional manager" |
| AC-9 all-failed batch rejected | BR-9 | MET | `activities.service.test.ts` → "raises a typed BusinessRuleError naming the rule and every item failure (BR-9)" — asserts `rule`, `statusCode` 422, `details[].rule` sorted `['BR-4','BR-6','BR-9']` |
| AC-10 accepted subset persisted with audit | BR-8 | MET | "appends one audit entry per updated activity carrying the transition (BR-8)" — `auditEntryCount` 2; and "applies the accepted subset and reports the rejected items" asserts the rejected item is still `TODO` |
| AC-11 no event this sprint | — | MET | No `events.publish` call exists in `bulkUpdateStatus`; gate `EV-1` reports nothing because the event is not yet in the catalogue |

## Files changed

| File | Change | Why |
| --- | --- | --- |
| `src/modules/activities/bulk-status.rules.ts` | new | Pure rule evaluation. Returns `{ rejections, accepted, failed }` so the service makes no rule decisions of its own. |
| `src/modules/activities/activities.types.ts` | `BULK_TARGET_STATUSES`, `MAX_BULK_BATCH_SIZE`, `'bulk_status_changed'` audit action | Rule constants belong with the domain type, so the schema, the rule and the message move together. |
| `src/modules/activities/activities.repository.ts` | `findMany`, `saveMany` | `saveMany` stages the whole batch before committing, so a mid-batch failure leaves the store untouched. |
| `src/modules/activities/activities.service.ts` | `bulkUpdateStatus` | Orchestrates load → evaluate → write. Throws `BusinessRuleError` on request-level rejection with every item failure in `details[]`. |
| `tests/unit/bulk-status.rules.test.ts` | new, 29 cases | Rule-level coverage, table-driven for the transition matrix. |
| `tests/unit/activities.service.test.ts` | bulk cases added | Persistence, audit trail, atomicity of rejection. |

## Gate result

```
$ npm run gate:full
GATE VERDICT: PASS  (blocking 0, advisory 0)
[PASS] boundaries    scanned 39 file(s)   no violations
[PASS] errors        scanned 33 file(s)   no violations
[PASS] test-quality  scanned 4 file(s)    no violations
[PASS] events        scanned 33 file(s)   no violations
[PASS] typecheck
[PASS] tests+coverage
```

| | Blocking | Advisory |
| --- | --- | --- |
| F1 boundaries | 0 | 0 |
| F2 errors | 0 | 0 |
| F3 test quality | 0 | 0 |
| F4 events | 0 | 0 |

Coverage: overall 91%, `activities.service.ts` 92%.

## Known gaps

None. The sprint is limited to rule evaluation and persistence, and every rule
in `active-rules.sprint-1.json` has a test that provokes it.

## Out-of-scope observations

1. `planBulkStatusUpdate` returns `accepted` entries holding the whole `Task`.
   Sprint 2 only needs `taskId`, `fromStatus` and the four routing fields for
   the event payload. Not narrowed now because the service needs the full task
   to build the audit entry — worth revisiting if a third consumer appears.
2. `BR-7`'s permission logic (`mayUpdate`) is also the right rule for the
   single-activity `PATCH /api/activities/:id`, which currently has its own
   inline check. Consolidating them would remove a drift risk. Out of scope:
   it touches an endpoint this sprint does not own.
