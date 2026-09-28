# Spec — shift handover bulk status update

> Written by the **Planner** on 2026-09-22 from a single developer prompt.
> Approved by the developer at 13:04 before any code was written.

## 1. Request

```
@planner Add shift handover bulk update to activities
```

## 2. Restatement in domain terms

At the end of a shift, outgoing store staff need to close off the work they
finished and flag what they could not complete, in one request rather than one
call per activity. Today that is `PATCH /api/activities/:id` per activity: a
grocery lead ending a shift with fourteen open activities makes fourteen calls,
each with its own failure mode, and any that fail leave the handover in an
unknown state.

The feature is a bulk status update restricted to the two statuses a handover
actually needs: `DONE` for completed work and `BLOCKED` for work the incoming
shift must pick up.

**Module that changes:** `activities` — new service operation, new endpoint,
new event.

**Modules that only react:** `alerts` (raises a `SHIFT_HANDOVER` summary to
store managers) and `reports` (recomputes the `STORE_SUMMARY`, because
completion figures have changed). Neither is called; both subscribe.

**Read-only dependency:** `staff`, for the department-lead and store-manager
lookups that authorisation and alert routing need.

### Interpretation adopted

The request does not say what should happen when some activities in the batch
can be updated and others cannot. Two readings are possible: reject the whole
batch, or apply what is valid and report the rest.

**We adopt partial failure.** A handover is a report of what actually happened
on the shop floor; refusing the whole batch because one activity was already
closed by a colleague would force staff to diff the list by hand at the end of
a shift, which is exactly the friction the feature exists to remove. The cost
is a more complex response contract, which BR-9 and the API conventions pin
down. This is the one decision the developer should confirm at approval.

## 3. Failure-mode surface

| Mode | Applies? | Where the risk is |
| --- | --- | --- |
| **F1** — sibling repository import | **yes, high** | The feature's whole point is a downstream notification. The shortest path from "raise an alert" to working code is `new InMemoryAlertRepository().save(...)` inside the activities service. This is the exact defect the client's prior pilot shipped. |
| **F2** — raw `Error` throws | **yes, high** | Nine rules, several of which are batch-level guards (empty list, over-limit, duplicate ids). `throw new Error('taskIds must not be empty')` is the path of least resistance and produces a 500 for a client mistake. |
| **F3** — status-code-only tests | **yes, very high** | Partial failure means the interesting outcomes are all *inside* a 200 response. A test asserting `200` proves nothing about which activities moved, which were rejected, or why. |
| **F4** — missing event integration | **yes, high** | The alert and the report recompute are both invisible from the endpoint's own response. Omitting the publish breaks neither the build nor any test of the endpoint itself. |

All four apply, which is why this feature was chosen for the demonstration run.

## 4. Business rules

Request-level rules reject the whole request. Per-item rules reject one item
and leave the rest of the batch to proceed.

| Rule | Level | Statement | Outcome when violated |
| --- | --- | --- | --- |
| **BR-1** | request | The batch contains 1–50 activity ids, with no duplicates | 400 (schema) or 422 `rule: BR-1` |
| **BR-2** | request | `targetStatus` is `DONE` or `BLOCKED`, and nothing else | 400 (schema) or 422 `rule: BR-2` |
| **BR-3** | request | A `BLOCKED` target requires a non-empty `note` giving the blocker | 422 `rule: BR-3` |
| **BR-4** | item | The activity exists | item `failed[]`, `code: ACTIVITY_NOT_FOUND`, `rule: BR-4` |
| **BR-5** | item | The activity belongs to the caller's store | item `failed[]`, `code: CROSS_STORE_FORBIDDEN`, `rule: BR-5` |
| **BR-6** | item | The transition from the activity's current status is legal | item `failed[]`, `code: ILLEGAL_TRANSITION`, `rule: BR-6` |
| **BR-7** | item | The caller is the assignee, the `DEPARTMENT_LEAD` of the activity's department, or a `STORE_MANAGER`/`REGIONAL_MANAGER` | item `failed[]`, `code: NOT_PERMITTED`, `rule: BR-7` |
| **BR-8** | post | Every updated activity gains an append-only audit entry recording actor, `fromStatus`, `toStatus` and the note | verified by test, not by response |
| **BR-9** | request | If no item could be updated, the request is rejected rather than reported as a successful no-op | 422 `rule: BR-9`, with every item failure in `details[]` |
| **BR-10** | post | Exactly one `activities.bulk_status.completed` is published, after the write, listing only the activities that changed | verified by test |
| **BR-11** | post | Alert and report state changes happen only in the `alerts` and `reports` subscribers; `activities` writes neither | verified by test and by gate rules MB-1/MB-6/EV-5 |

BR-5 deserves a note: it holds even for a `REGIONAL_MANAGER`, who can see
several stores. Bulk operations are store-scoped without exception, because a
mis-typed batch crossing stores is not recoverable from the audit trail alone.

## 5. API surface

| Method + path | Request | Success | Failure |
| --- | --- | --- | --- |
| `PATCH /api/activities/bulk-status` | `{ taskIds: string[1..50], targetStatus: 'DONE'\|'BLOCKED', note?: string }` | `200` with `{ data: { bulkOperationId, targetStatus, updatedCount, failedCount, updated[], failed[] } }` | `400` schema · `401` no token · `422` request-rule violation or BR-9 |

Registered before `PATCH /api/activities/:id` so the literal path is not
captured by the parameterised route.

## 6. Events

| Event | Owner | Published when | Consumers |
| --- | --- | --- | --- |
| `activities.bulk_status.completed` | `activities` | After the accepted subset is persisted | `alerts.handover-summary` → `SHIFT_HANDOVER` notification per store manager; `reports.store-summary-on-handover` → `STORE_SUMMARY` recompute |

Payload carries `priority`, `category`, `departmentId` and `assigneeId` per
updated item, not just ids, so the alerts module can route escalations without
calling back into `activities` — which would reintroduce F1.

## 7. Sprint breakdown

| Sprint | Scope | Rules | Deliverable |
| --- | --- | --- | --- |
| **1** | Pure rule evaluation + service operation + repository batch write. No HTTP, no events. | BR-1 … BR-9 | `bulk-status.rules.ts`, `ActivityService.bulkUpdateStatus`, `ActivityRepository.saveMany`, unit tests |
| **2** | HTTP endpoint + event publication + `alerts`/`reports` subscribers | BR-10, BR-11 (and BR-1…BR-9 re-verified through HTTP) | `activities.routes.ts`, event contract, `alerts.subscribers.ts`, `reports.subscribers.ts`, integration tests |

Sprint 1 is independently valuable: the rules are testable and reviewable
before any decision about the wire format. Sprint 2 cannot start before the
rules are agreed, because the response contract is a projection of the rule
outcomes.

## 8. Out of scope

- **Undoing a handover.** No bulk revert. `DONE` is terminal by design; an
  erroneous completion is corrected by creating a new activity, which keeps
  the audit trail honest.
- **Reassigning during handover.** Changing owner is `PATCH /api/activities/:id`.
  Bundling it here would double the rule surface for a case staff rarely need.
- **Cross-store batches.** Explicitly forbidden by BR-5, not deferred.
- **SLA breach alerting** (spec 3.4 feature 2) — separate feature, F-2.
- **Notification delivery.** `alerts` records notifications at `PENDING`;
  actual email/in-app dispatch is a downstream concern.

## 9. Open decisions for the developer

1. **Partial failure vs all-or-nothing** (section 2). We adopted partial
   failure. If the client's ops team would rather have an atomic batch, BR-9
   and the whole `failed[]` contract change, and it is cheaper to decide now.
2. **Batch ceiling of 50.** Chosen as roughly three times the largest
   observed open-activity count for one colleague on one shift. Trivially
   changed — `MAX_BULK_BATCH_SIZE` — but it is a rule, so it needs a number.

---

**Developer approval:** reply `APPROVED` to start the autonomous
Generator/Evaluator loop, or give change notes for a revision.

> **Developer response, 2026-09-22 13:04:**
> `APPROVED` — partial failure is right, ops would rather see what failed than
> re-do the batch. Keep 50.
