# Sprint 1 contract — shift handover bulk status update

## Scope

**In:**

- `src/modules/activities/bulk-status.rules.ts` — pure rule evaluation for the
  batch: request-level rejections, per-item accept/fail classification, and the
  assignee/permission decision. No I/O of any kind.
- `src/modules/activities/activities.service.ts` — `bulkUpdateStatus(principal,
  request, correlationId)`: load the batch, evaluate, write the accepted
  subset, return the result.
- `src/modules/activities/activities.repository.ts` — `saveMany` for a
  single-commit batch write, and `findMany` for the batch load.
- `src/modules/activities/activities.types.ts` — `BULK_TARGET_STATUSES`,
  `MAX_BULK_BATCH_SIZE`, `TaskAuditEntry.action` gains
  `'bulk_status_changed'`.
- `tests/unit/bulk-status.rules.test.ts` and the bulk cases in
  `tests/unit/activities.service.test.ts`.

**Out:**

- The HTTP endpoint — sprint 2.
- `activities.bulk_status.completed` and the `alerts`/`reports` subscribers —
  sprint 2. The service must be written so the publish slots in after the
  write without restructuring, but must not publish in this sprint.

## Carried-in work

None — first sprint of this feature.

## Business rules in this sprint

| Rule | Statement | Enforced where | Outcome when violated |
| --- | --- | --- | --- |
| BR-1 | Batch of 1–50 ids, no duplicates | `planBulkStatusUpdate` | `rejections[]`, rule `BR-1` |
| BR-2 | `targetStatus` ∈ {`DONE`, `BLOCKED`} | `planBulkStatusUpdate` | `rejections[]`, rule `BR-2` |
| BR-3 | `BLOCKED` requires a non-empty `note` | `planBulkStatusUpdate` | `rejections[]`, rule `BR-3` |
| BR-4 | Activity exists | per-item | `failed[]`, `ACTIVITY_NOT_FOUND` |
| BR-5 | Activity is in the caller's store | per-item | `failed[]`, `CROSS_STORE_FORBIDDEN` |
| BR-6 | Transition is legal from current status | per-item | `failed[]`, `ILLEGAL_TRANSITION` |
| BR-7 | Caller is assignee, department lead of that department, or store/regional manager | per-item, `mayUpdate` | `failed[]`, `NOT_PERMITTED` |
| BR-8 | Audit entry per updated activity | `ActivityService.bulkUpdateStatus` | — |
| BR-9 | Nothing updatable ⇒ whole request rejected | `planBulkStatusUpdate` + service | `BusinessRuleError` with rule `BR-9` |

## Acceptance criteria

### AC-1 — a valid batch is planned in full (BR-1, BR-6)

- **GIVEN** two activities on the caller's store in `IN_PROGRESS` and `TODO`
- **WHEN** `planBulkStatusUpdate` is called with both ids and `targetStatus: 'DONE'`
- **THEN** `rejections` and `failed` are empty, and `accepted` has one entry per
  id, in request order, each carrying the item's `fromStatus`

### AC-2 — batch bounds are enforced (BR-1)

- **GIVEN** a request with an empty id list, or 51 ids, or a duplicated id
- **WHEN** the plan is evaluated
- **THEN** a `BR-1` rejection is produced and `accepted` is empty in each case

### AC-3 — only DONE and BLOCKED are reachable in bulk (BR-2)

- **GIVEN** `targetStatus: 'IN_PROGRESS'`
- **WHEN** the plan is evaluated
- **THEN** a `BR-2` rejection is produced

### AC-4 — blocking requires a reason (BR-3)

- **GIVEN** `targetStatus: 'BLOCKED'` with `note` absent, empty, or whitespace
- **WHEN** the plan is evaluated
- **THEN** a `BR-3` rejection is produced with `path: 'note'`
- **AND GIVEN** the same request with a real note, **THEN** the item is accepted

### AC-5 — request-level failure short-circuits item evaluation (BR-1, BR-3)

- **GIVEN** a request that is invalid at request level
- **WHEN** the plan is evaluated
- **THEN** `failed` is empty — no item is judged, because nothing will be
  attempted

### AC-6 — per-item failures are isolated (BR-4, BR-5, BR-6, BR-7)

- **GIVEN** a batch of four ids: one valid, one non-existent, one already
  `DONE`, one belonging to another store
- **WHEN** the plan is evaluated
- **THEN** `accepted` contains exactly the valid id, and `failed` contains one
  entry per rejected id carrying `taskId`, a stable `code`, and the rule id
  (`BR-4`, `BR-6`, `BR-5` respectively)

### AC-7 — the permission rule is exhaustively specified (BR-7)

- **GIVEN** an activity assigned to `user_alice` in `dept_grocery`
- **WHEN** `mayUpdate` is evaluated for each principal
- **THEN** assignee → true; `DEPARTMENT_LEAD` of `dept_grocery` → true;
  `DEPARTMENT_LEAD` of another department → false; `STORE_MANAGER` → true;
  `REGIONAL_MANAGER` → true; unrelated `ASSOCIATE` → false; and a
  `DEPARTMENT_LEAD` against an activity with no department → false

### AC-8 — cross-store items are refused for every role (BR-5)

- **GIVEN** an activity in `store_902` and a `REGIONAL_MANAGER` principal of
  `store_401`
- **WHEN** the plan is evaluated
- **THEN** the item fails with `CROSS_STORE_FORBIDDEN` and `accepted` is empty

### AC-9 — an all-failed batch is a rejected request (BR-9)

- **GIVEN** a batch in which every item fails a per-item rule
- **WHEN** the service executes the operation
- **THEN** it throws `BusinessRuleError` with `rule: 'BR-9'`, `statusCode` 422,
  and `details[]` carrying every item failure with its own rule id
- **AND** no activity is modified

### AC-10 — the accepted subset is persisted with an audit entry (BR-8)

- **GIVEN** a mixed batch with at least one valid item
- **WHEN** the service executes the operation
- **THEN** each accepted activity has the target status, `auditEntryCount` has
  increased by one, and each rejected activity is byte-for-byte unchanged

### AC-11 — no event is published in this sprint

- **GIVEN** any successful bulk update
- **WHEN** the service completes
- **THEN** no `activities.bulk_status.completed` event exists on the bus

## Files expected to change

| File | Purpose | Criteria served |
| --- | --- | --- |
| `src/modules/activities/bulk-status.rules.ts` | new — pure rule evaluation | AC-1…AC-8 |
| `src/modules/activities/activities.types.ts` | bulk constants, audit action | AC-2, AC-3, AC-10 |
| `src/modules/activities/activities.repository.ts` | `findMany`, `saveMany` | AC-10 |
| `src/modules/activities/activities.service.ts` | `bulkUpdateStatus` | AC-9, AC-10, AC-11 |
| `tests/unit/bulk-status.rules.test.ts` | new — rule-level tests | AC-1…AC-8 |
| `tests/unit/activities.service.test.ts` | service-level bulk cases | AC-9…AC-11 |

## Definition of done

- `npm run gate:full` is PASS with zero blocking findings.
- Every acceptance criterion MET with file:line or test-name evidence.
- Every rule id in `active-rules.sprint-1.json` asserted by a test that
  provokes it.
- Coverage thresholds hold (service 80%, routes 70%, shared 60%, overall 70%).
- No changes outside the scope above — in particular, no route file and no
  event publication.

