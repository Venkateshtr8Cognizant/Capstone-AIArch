# Run log — shift handover bulk status update

**Run:** 2026-09-22 · **Feature:** `shift-handover-bulk-status` ·
**Harness version:** initial (first governed run on StoreOps)

## Sprint outcomes

| Sprint | Iterations (of 3) | Verdict | Escalated | Blocking findings | Advisory | Criteria met |
| --- | --- | --- | --- | --- | --- | --- |
| 1 — rules + service | 1 | PASS | no | 0 | 0 | 11 / 11 |
| 2 — API + events | 2 | PASS | no | 23 → 0 | 0 → 4 | 11 / 11 |

Three Generator invocations, three Evaluator verdicts, one FAIL→PASS recovery,
no developer intervention after `APPROVED`.

## Findings by failure mode

| Mode | Sprint 1 | Sprint 2 iter 1 | Sprint 2 iter 2 | Reached main |
| --- | --- | --- | --- | --- |
| F1 boundaries | 0 | **3** | 0 | **0** |
| F2 errors | 0 | **5** | 0 | **0** |
| F3 test quality | 0 | **11** | 0 | **0** |
| F4 events | 0 | **4** | 0 (4 advisory) | **0** |
| **Total blocking** | 0 | **23** | 0 | **0** |

All four failure modes the client's standards team identified occurred in this
run, and none reached main. That is the harness's headline result, and it is
worth being precise about what produced it: **the tests were green and the
typecheck passed on the rejected iteration.** `npm test` alone would have
merged all 23 findings.

## Findings by check

| Check | Rules fired (sprint 2, iteration 1) | Count |
| --- | --- | --- |
| boundaries | `MB-1` ×2, `MB-6` ×1 | 3 |
| errors | `EH-1` ×2, `EH-4` ×3 | 5 |
| test-quality | `TQ-2` ×2, `TQ-3` ×1, `TQ-7` ×8 | 11 |
| events | `EV-1` ×2, `EV-5` ×2 | 4 |

`TQ-7` produced a third of all findings from a single root cause — eight
contract rules with no test naming them. It is the cheapest check in the
harness and the one most directly tied to the Planner's intent.

## Quality signals

- **Coverage:** 93.22% lines overall (threshold 70%); service files 87.6%–100%
  (threshold 80%); route files 100% (threshold 70%)
- **Test count:** 101 — 72 unit, 29 integration
- **Gate runtime:** static 0.2s; full 33.4s (typecheck 11.5s, tests+coverage 21.7s)
- **Gate self-test:** PASS, 5/5 fixtures, all four failure modes provably caught

The gate runtime split matters for how the harness is used: at 0.2 seconds the
static checks are a feedback loop the Generator can run after every edit, which
is why iteration 2 arrived clean rather than needing a third pass.

## Cost

Estimated, not measured. Basis: agent invocations × (skill context per
CLAUDE.md §6 + observed input/output per turn).

| Agent | Invocations | Est. tokens | Basis |
| --- | --- | --- | --- |
| Planner | 1 | ~14k | 4k skills + spec/contract/rules output across 2 sprints |
| Generator | 3 | ~78k | 12k skills per invocation (context reset between sprints) + code and test output; iteration 2 also carried the 3.5k feedback document |
| Evaluator | 3 | ~46k | 9k skills per invocation + reading the diff, the summary and the gate report |
| Monitor | 2 | ~6k | no skills; handoff files only |
| **Total** | **9** | **~144k** | |

Two observations on cost shape:

1. **The failed iteration cost ~41k tokens** (Generator 26k + Evaluator 15k) —
   roughly 28% of the run. That is the price of the harness catching what it
   caught, and it compares favourably with a human review cycle plus a
   post-merge fix, let alone a production defect in shift handover.
2. **Context reset between sprints saved an estimated 15–20k tokens** and, more
   importantly, kept a superseded sprint-1 instruction from surviving into
   sprint 2.

**Wall-clock:** 13:11 (first Generator invocation) → 14:38 (final verdict) —
1h 27m, including 33s of gate runs per verdict.

## Quality trend

First governed run, so there is no baseline to compare against. Establishing
the baseline for future runs:

| Metric | Baseline (this run) |
| --- | --- |
| Blocking findings per sprint | 11.5 (23 across 2 sprints) |
| Iterations per sprint | 1.5 |
| Escalations | 0 |
| Findings reaching main | 0 |
| `EV-6` advisory count | 4 |
| Coverage | 93.2% |

What to watch in run 2:

- **Whether F2 recurs.** Five `EH-*` findings in one iteration suggests
  `error-handling.skill.md` was not landing at the point of writing. It has
  since been amended (see recommendation R-1). If `EH-*` fires again next run,
  the skill file is not the problem and the check emphasis needs rethinking.
- **The `EV-6` count.** Four unconsumed events is defensible today. If it
  reaches six or seven, the catalogue is accumulating channels nobody
  consumes — which is failure mode F4 arriving slowly rather than all at once.
- **`TQ-7` recurrence.** This is the check most likely to fire when the
  Generator is under context pressure, because naming eight rules across a test
  suite is the last thing written and the first thing dropped.

## Recommended harness changes

| # | Change | Evidence | Rationale |
| --- | --- | --- | --- |
| **R-1** | Add a "Self-check before you hand off" list to the end of every skill file | The Evaluator's note on iteration 1: "the Generator's failure was not knowing how — it was not noticing that the publish was missing" | Knowledge was present; the absence of a closing checklist was the gap. **Status: accepted and implemented** — all six skill files now end with a self-check list. |
| **R-2** | Have the orchestrator refuse a `generator-summary.md` whose gate table was not produced by an actual gate run, and treat an empty evidence cell as NOT MET | Iteration 1's summary reported four zeros in the gate table having run only `npm test`, and marked three criteria MET with no evidence | The single largest source of wasted effort in this run was a confidently wrong self-report. The Evaluator caught it, but the check is mechanical and belongs earlier. |

Not recommended, deliberately:

- **Loosening `TQ-7`.** Eight findings from one rule looks noisy, but every one
  was a genuine missing link between a contract rule and a test.
- **Archiving `gate-report.json` retrospectively** to fill the sprint-1 gap. The
  fix is to archive per iteration *at the time the gate runs* — a report
  reconstructed later is not evidence. Noted in the run's `README.md`.

## Escalations

None.

| Sprint | Iteration | Cause category | Resolution |
| --- | --- | --- | --- |
| — | — | — | — |

For the record, the iteration-1 FAIL was **not** an ambiguous-contract case.
The Evaluator assessed the contract as specific and checkable and recommended
re-running iteration 2 against it unchanged, which is what happened. Had the
same findings recurred in iteration 3, the escalation category would have been
`skill file gap`, not `ambiguous contract`.

## Archive

Archived to
`.harness/reviews/2026-09-22-shift-handover-bulk-status/`, including
`sprint-2-iteration-1/rejected-code/` and both machine-readable gate reports,
so the FAIL→PASS path is reproducible and not merely described. Provenance of
each artefact is documented in that directory's `README.md`.
