# Evaluator feedback — sprint 2, iteration 2

## Verdict

**PASS**

The gate is clean, all seven blocking findings from iteration 1 are resolved at
their root rather than worked around, and every acceptance criterion is
independently verified as MET with a named test. The decisive check was AC-11:
the subscriber list is now asserted directly, which means the F4 defect from
iteration 1 — a declared event nobody publishes and nobody listens for — cannot
recur silently. It would now break a named test.

## Gate result (deterministic — not subject to review judgement)

```
$ npm run gate:full
GATE VERDICT: PASS  (blocking 0, advisory 4)
```

| | Blocking | Advisory |
| --- | --- | --- |
| F1 boundaries | 0 | 0 |
| F2 errors | 0 | 0 |
| F3 test quality | 0 | 0 |
| F4 events | 0 | 4 |
| typecheck | pass (11.5s) | |
| tests + coverage | pass (21.7s) | |

Coverage: 93.22% lines overall; service files 87.6–100%; route files 100%.
Thresholds are 70% overall and 80% service, so there is real headroom.

Machine-readable output: `gate-report.json` in this directory.

## Acceptance criteria — independently verified

| Criterion | Rule | Generator claimed | Evaluator verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-1 | BR-10 | MET | **MET** | Read the test: it asserts the event count, the payload length, *and* the propagated `correlationId`. The last of those is what proves the publish is inside the request path and not a fixture artefact. |
| AC-2 | BR-4, BR-7 | MET | **MET** | `failed[]` carries stable codes and rule ids. Verified the re-read assertion actually queries the API rather than the in-memory result. |
| AC-3 | BR-9 | MET | **MET** | `error.details[]` carries both `BR-9` and the per-item `BR-4`; 0 events asserted. |
| AC-4 | BR-3 | MET | **MET** | Asserts the rule id, the offending path, and that the activity is unchanged. |
| AC-5 | BR-1, BR-2 | MET | **MET** | Two separate 400 cases, each naming the offending field. |
| AC-6 | BR-1 | MET | **MET** | Duplicate detection is in the shared rule function, so the unit suite covers it too. |
| AC-7 | — | MET | **MET** | Also asserts no event was published on the unauthenticated path. |
| AC-8 | BR-5 | MET | **MET** | Confirmed the rejection is `BR-5` (cross-store) and not `BR-4` (not found) — the id does resolve, so `BR-5` is the honest reason. The Generator's first draft of this test expected `BR-4`; correcting it to `BR-5` is right. |
| AC-9 | BR-11 | MET | **MET** | Observed through `GET /api/alerts`, so the assertion passes only if the alerts module's own `raise()` ran: channel `IN_APP` and status `PENDING` are both alerts-module policy that a direct repository write would have skipped. |
| AC-10 | BR-11 | MET | **MET** | `completionRate: 0.5` from two activities with one complete — the figure is computed from activities read through the public port, so it also exercises the read-port path. |
| AC-11 | BR-11 | MET | **MET** | Exact-array assertion on the subscriber names. |

No criterion the Generator claimed was found NOT MET. Every evidence cell
names a real test, which was not true in iteration 1.

## Rule coverage

| Rule | Test that provokes it | Meaningful? | Note |
| --- | --- | --- | --- |
| BR-1 | duplicate-ids case (422) + schema ceiling case (400) | yes | Deleting the duplicate check turns the 422 case red |
| BR-3 | "BLOCKED without a note" | yes | Asserts the rule id, not just the status |
| BR-4 | partial-failure case | yes | Asserts the exact `failed[]` entry |
| BR-5 | cross-store manager case | yes | |
| BR-7 | partial-failure case (associate vs another department) | yes | Also covered by the sprint-1 `mayUpdate` suite |
| BR-9 | all-failed batch case | yes | |
| BR-10 | "publishes exactly one bulk event…" | yes | Would fail on zero events, two events, or a wrong payload |
| BR-11 | subscriber-list assertion + alerts + reports cases | yes | Three independent angles on the same rule |

I applied the delete-the-check test to BR-10 and BR-11 specifically, since
they were the criteria falsely claimed last iteration. Removing the
`events.publish` call fails four named tests; removing either subscriber
registration fails two. The wiring is genuinely pinned.

## Findings

### Blocking

None.

### Advisory

#### A-1 — `EV-6` — `src/contracts/events.ts` (F4)

- **What:** Four events are published with no in-process subscriber:
  `activities.task.created`, `programmes.member.added`,
  `alerts.notification.created`, `reports.report.requested`.
- **Assessment:** All four are legitimate downstream channels, not missing
  consumers, and none was introduced by this sprint. No action now.
- **Suggested change:** The Monitor should track the count. An `EV-6` count
  that only ever grows is the F4 pattern arriving slowly — each unconsumed
  event is a place where a subscriber might have been intended.

#### A-2 — duplicated BR-3 check — `activities.service.ts` `patch()`

- **What:** The single-activity `patch()` method has its own inline BR-3 note
  check, separate from the one in `planBulkStatusUpdate`.
- **Assessment:** Not a sprint-2 regression — it predates this work — and the
  bulk path is correct. But it is the same duplication pattern that caused
  iteration 1's B-7, so it is worth clearing before it drifts.
- **Suggested change:** Extract the note requirement into a shared predicate
  used by both paths. Recorded for the Planner; too small to justify a sprint
  of its own.

## Required follow-ups

None. This is an unconditional PASS, so nothing is carried into a next sprint.
A-2 is recorded for the Planner's backlog rather than as carried-in work,
because it is outside this feature's scope.

## Evaluator notes

1. **The fix was structural, not cosmetic.** The Generator could have satisfied
   most of the gate by adding a publish call and richer assertions while keeping
   the inline item loop. It instead deleted the loop and called the sprint-1
   rule function, which is why BR-7 came back for free — the permission check
   was never missing from the rule function, only from the copy. One
   implementation of a rule is worth more than any number of tests over two.

2. **On the AC-8 expectation correction.** The Generator's first pass at that
   test expected `BR-4`, reasoning that a cross-store id is effectively
   invisible. The implementation returned `BR-5`, and the implementation is
   right: the id resolves, so "not found" would be a less honest reason than
   "cross-store". Worth noting because the correction went in the right
   direction — the test was changed to match correct behaviour, not the
   behaviour changed to match a convenient test. The opposite is the more common
   AI failure mode and it is one the gate cannot detect.

3. **What the gate could not have told you.** Two things I checked by reading:
   whether `GET /api/alerts` in AC-9 genuinely proves the subscriber path (it
   does — `channel: 'IN_APP'` and `status: 'PENDING'` are alerts-module policy,
   unreachable by a direct repository insert), and whether the event payload is
   sufficient for its consumers (it is — the alerts subscriber routes on
   `storeId` alone, and the four per-item routing fields cover the escalation
   case F-2 will need). A payload that forced a subscriber to call back into
   activities would have passed every check while reintroducing F1.

