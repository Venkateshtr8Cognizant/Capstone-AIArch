# Evaluator feedback — sprint 2, iteration 1

## Verdict

**FAIL**

The gate returned 23 blocking findings spanning all four failure modes, so the
verdict is determined before judgement is applied. Beyond the gate, three
acceptance criteria the Generator marked MET are not met: the
`activities.bulk_status.completed` event is declared in the catalogue and never
published, so AC-10 (store summary recompute) and AC-11 (subscriber wiring) have
no implementation at all, and AC-9's notification is produced by writing
directly into the alerts module's repository rather than by the alerts module
reacting to an event.

The decisive point for the next iteration: **the three tests are green and the
endpoint works when you call it by hand.** Nothing in the test suite
distinguishes this implementation from a correct one. Fixing the tests is not
optional cleanup — it is the only thing that will keep the event integration
from regressing next sprint.

## Gate result (deterministic — not subject to review judgement)

```
$ npm run gate:full
GATE VERDICT: FAIL  (blocking 23, advisory 0)
```

| | Blocking | Advisory |
| --- | --- | --- |
| F1 boundaries | 3 | 0 |
| F2 errors | 5 | 0 |
| F3 test quality | 11 | 0 |
| F4 events | 4 | 0 |
| typecheck | pass | |
| tests + coverage | **pass** | |

Note the last row. Typecheck passed and the tests passed. That is the whole
problem: `tests+coverage` is a necessary signal and never a sufficient one.

Full machine-readable output: `gate-report.json` in this directory. Reproduce
it with:

```bash
node .harness/checks/gate.mjs --root=<this dir>/rejected-code --out=../gate-report.json
```

## Acceptance criteria — independently verified

| Criterion | Rule | Generator claimed | Evaluator verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-1 | BR-10 | MET | **NOT MET** | The endpoint applies the batch, but no event is published. `activities.service.ts:88` discards the bus (`void this.deps.events`). The test asserts only `status === 200`. |
| AC-2 | BR-4, BR-7 | MET | **NOT MET** | `failed[]` entries carry `{ taskId, reason: 'not found' }` — prose, with no stable `code` and no `rule`. The contract requires `ACTIVITY_NOT_FOUND`/`BR-4`. BR-7 is not implemented at all: there is no permission check in the item loop. |
| AC-3 | BR-9 | MET | **NOT MET** | There is no BR-9 check. An all-failed batch returns 200 with `updatedCount: 0` — exactly the successful no-op the rule exists to prevent. |
| AC-4 | BR-3 | MET | **PARTIAL — NOT MET** | The rule is enforced, but in the route with a hand-rolled `res.status(422).json({ message })`. No `error.rule`, so no client and no test can tell which rule fired. |
| AC-5 | BR-1, BR-2 | MET | **MET** | zod schema bounds are correct. |
| AC-6 | BR-1 | MET | **NOT MET** | Duplicates are not detected. `z.array().min(1).max(50)` does not check uniqueness, and the service has no duplicate check. `['task_1','task_1']` is accepted. |
| AC-7 | — | MET | **MET** | 401 is produced by the platform auth middleware. |
| AC-8 | BR-5 | MET | **PARTIAL** | The store check exists, but produces `reason: 'wrong store'` instead of `CROSS_STORE_FORBIDDEN`/`BR-5`, and there is no test. |
| AC-9 | BR-11 | MET | **NOT MET** | The notification is written by `activities` directly into `InMemoryAlertRepository`. Recipient hardcoded to `user_sam`; channel policy, `PENDING` status and `alerts.notification.created` all bypassed. This is failure mode F1 exactly as the client's prior pilot produced it. |
| AC-10 | BR-11 | MET (no evidence) | **NOT MET** | Not implemented. No `reports` subscriber exists, and it could not work if it did, because the event is never published. |
| AC-11 | BR-11 | MET (no evidence) | **NOT MET** | No subscribers registered; no test inspects the subscriber list. |

Four criteria were marked MET with no evidence in the evidence column. Treat
an empty evidence cell as NOT MET in future iterations.

## Rule coverage

| Rule | Test that provokes it | Meaningful? | Note |
| --- | --- | --- | --- |
| BR-1 | none | — | `TQ-7`: not asserted anywhere |
| BR-3 | "rejects a blocked update with no note" | **no** | Asserts `422` only; would pass if the wrong rule fired |
| BR-4 | none | — | `TQ-7` |
| BR-5 | none | — | `TQ-7` |
| BR-7 | none | — | Not implemented |
| BR-9 | none | — | Not implemented |
| BR-10 | none | — | Not implemented |
| BR-11 | none | — | Not implemented |

## Findings

Ordered by severity.

### Blocking

#### B-1 — `MB-1`, `MB-6`, `EV-5` — `activities.service.ts:9` and `:11` (F1)

- **What:** The activities module imports `InMemoryAlertRepository` and
  `AlertService` from the alerts module and writes a notification row directly
  (`activities.service.ts:97`).
- **Why it matters:** This is the exact defect that blocked the Claude Code
  rollout. The alerts module's channel routing (`SHIFT_HANDOVER → IN_APP`), its
  initial `PENDING` status, its recipient resolution, and its
  `alerts.notification.created` event are all skipped. The row exists; the
  behaviour does not. A schema change in alerts now breaks activities silently.
- **Required change:** Delete both imports and the `alertRepository` /
  `alertService` fields. Publish `activities.bulk_status.completed` after the
  batch write, and create `src/modules/alerts/alerts.subscribers.ts` with a
  subscriber named `alerts.handover-summary` that resolves recipients via
  `StaffReadPort.listStoreManagers` and calls `AlertService.raise`.

#### B-2 — `EV-1` — `src/contracts/events.ts:1` (F4)

- **What:** `activities.bulk_status.completed` is declared in
  `StoreOpsEventMap` and `EVENT_OWNERS` and is never published.
  `alerts.notification.created` likewise.
- **Why it matters:** BR-10 requires exactly one event per completed handover;
  BR-11 requires alerts and reports to react to it. With no publish there is no
  handover alert for the incoming shift and no `STORE_SUMMARY` recompute — and
  **nothing fails**. This is the defect class the endpoint's own response can
  never reveal.
- **Required change:** In `bulkUpdateStatus`, after `saveMany` succeeds,
  publish one event whose payload carries per-item `taskId`, `fromStatus`,
  `priority`, `category`, `departmentId` and `assigneeId` — the routing fields
  a subscriber needs so it never has to call back into activities.

#### B-3 — `EH-1` — `activities.service.ts:42` and `:45` (F2)

- **What:** `throw new Error('taskIds must not be empty')` and
  `throw new Error('too many taskIds')`.
- **Why it matters:** Both are client mistakes and both become HTTP 500
  `INTERNAL_ERROR`, which is non-operational and pages on-call. Neither carries
  a rule id, so BR-1 cannot be asserted by a test.
- **Required change:** Both conditions belong in `planBulkStatusUpdate` as BR-1
  rejections (they already exist there from sprint 1 — this code duplicated the
  guard instead of calling the rule function). Delete them and call
  `planBulkStatusUpdate`, throwing `BusinessRuleError` with the returned rule id.

#### B-4 — `EH-4` — `activities.routes.ts:21`, `:29`, `:43` (F2)

- **What:** Three hand-rolled error responses: `res.status(400).json({ message })`,
  `res.status(422).json({ message })`, `res.status(500).json({ message: String(error) })`.
- **Why it matters:** The bodies do not match the project envelope
  (`{ error: { code, message, details, correlationId } }`), so no client can
  parse errors consistently; the 422 carries no `rule`; and the catch-all 500
  would swallow a legitimate `BusinessRuleError` and report it as a server
  fault.
- **Required change:** Delete all three. Use `parseBody(bulkStatusSchema, …)`
  for validation, let the service throw, and remove the try/catch entirely —
  `route()` forwards rejections to `errorHandler`, which owns the wire format.

#### B-5 — `TQ-2`, `TQ-3` — `bulk-status.api.test.ts:12`, `:27`, `:40` (F3)

- **What:** All three tests assert only a status code. "updates activities in
  bulk" asserts `200` and nothing else; "rejects a blocked update with no note"
  asserts `422` with no rule id.
- **Why it matters:** These tests pass against an implementation that updates
  zero activities, publishes no event, writes no audit entry and notifies
  nobody — which is precisely the implementation under review. They also gave
  100% line coverage of the handler, so coverage offered no warning.
- **Required change:** For the success case, additionally assert
  `data.updatedCount`, the status of each entry in `data.updated`, exactly one
  `activities.bulk_status.completed` on the bus with the right
  `correlationId`, and that `GET /api/activities?status=DONE` reflects the
  change. For the 422 case, assert `error.rule === 'BR-3'` and
  `details[0].path === 'note'`, and that the activity is still `TODO`.

#### B-6 — `TQ-7` — `active-rules.json` (F3)

- **What:** Eight of the eight rules in the sprint's `active-rules.json`
  (BR-1, BR-3, BR-4, BR-5, BR-7, BR-9, BR-10, BR-11) appear in no test.
- **Why it matters:** The Planner's acceptance criteria and the test suite have
  no traceable link. Nothing connects intent to verification.
- **Required change:** One test per rule that provokes it and names it. BR-10
  and BR-11 are post-conditions with no error to assert on, so name them in the
  test title and assert the event count and the subscriber list respectively.

#### B-7 — BR-6, BR-7, BR-8, BR-9 not implemented — `activities.service.ts:50-78`

- **What:** The item loop was rewritten inline instead of calling
  `planBulkStatusUpdate` from sprint 1. In the process: the permission check
  (BR-7) was dropped entirely, no audit entry is appended (BR-8), the
  all-failed guard (BR-9) is absent, duplicates are not detected (BR-1), and
  `failed[]` entries lost their stable codes and rule ids.
- **Why it matters:** Sprint 1's rule function was reviewed, agreed and
  exhaustively tested. Reimplementing it in sprint 2 discards that work and
  creates two places for the rules to drift apart. BR-7's absence is a security
  finding, not a style one: any authenticated colleague can close any activity
  in their store.
- **Required change:** Delete the inline loop. Call
  `planBulkStatusUpdate({ request, tasks, principal })` and act on its
  `rejections` / `accepted` / `failed`. Append the audit entry per accepted
  item via `appendAudit`.

### Advisory

None — the blocking list is long enough that advisory findings would be noise.

## Required follow-ups

Not applicable: a FAIL cannot carry follow-ups. All findings must be resolved
in iteration 2.

## Evaluator notes

Three observations for the Monitor.

1. **This is the case the harness was built for.** A reasonable reviewer, given
   this diff and a green test suite, would have approved it. Every defect is a
   shortcut that reads as pragmatism — one import, two guard clauses, three
   short tests. The gate found 23 issues in 0.2 seconds; no human reviewer
   finds `EV-1` (a declared-but-unpublished event) by reading a diff.

2. **F3 and F4 are one defect seen from two angles.** The missing event was
   undetectable *because* the tests asserted status codes. If I had to keep only
   one check from this harness, it would be `TQ-2`, because status-only tests
   are what let every other failure mode survive review.

3. **The contract was not at fault.** All eleven criteria were specific and
   checkable; the Generator simply did not verify against them before
   reporting. This is not an ambiguous-contract escalation, and iteration 2
   should be given the same contract unchanged. What I would change is the
   *skill* emphasis: `event-integration.skill.md` explains how to publish, but
   the Generator's failure was not knowing how — it was not noticing that the
   publish was missing. A "self-check before you hand off" list at the end of
   each skill would have caught it, and I am recommending that to the Monitor.
