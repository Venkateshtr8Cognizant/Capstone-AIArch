# Demonstration run — shift handover bulk status update

**Feature:** SPEC 3.4 feature 1 — "Add shift handover bulk update … allowing
outgoing shift staff to mark multiple operational activities as DONE or
BLOCKED in a single request, with partial failure handling and an audit entry
per updated task."

**Date:** 2026-09-22 · **Sprints:** 2 · **Generator invocations:** 3 ·
**Escalations:** 0 · **Final state:** both sprints PASS, feature merged.

## What this run demonstrates

One sprint that passed first time, and one that **failed and recovered** —
which is the more important half. Sprint 2's first attempt contained all four
of the failure modes the client's standards team demanded the harness prevent.
The gate caught 23 blocking findings, the Evaluator returned FAIL with
line-level feedback, and the Generator's second attempt passed. No human
intervened between the FAIL and the PASS.

## Artefact index

| File | Written by | Notes |
| --- | --- | --- |
| `spec.md` | Planner | Includes the developer's `APPROVED` response |
| `sprint-1.contract.md` | Planner | 9 rules, 11 acceptance criteria |
| `sprint-2.contract.md` | Planner | 2 new rules + HTTP re-verification, 11 criteria |
| `active-rules.sprint-1.json` / `active-rules.sprint-2.json` | Planner | Machine-readable; drives gate rule `TQ-7` |
| `sprint-1-iteration-1/` | Generator, Evaluator | PASS first time |
| `sprint-2-iteration-1/` | Generator, Evaluator | **FAIL** — includes the rejected code and the real gate report |
| `sprint-2-iteration-2/` | Generator, Evaluator | PASS |
| `run-log.md` | Monitor | Outcomes, cost, quality trend, recommendations |
| `transcript.md` | — | The orchestration trace: who ran, in what order, on what routing decision |

For submission discoverability, the archive root also contains canonical
copies named `sprint-1-contract.md`, `sprint-2-contract.md`,
`generator-summary.md`, and `evaluator-feedback.md`. The iteration directories
remain the provenance source and preserve the full FAIL-to-PASS history.

## Provenance of the evidence

Being precise about which artefacts are captured tool output and which are
agent-written records, because a governance archive that blurs the two is not
worth keeping:

**Captured tool output — reproduce it yourself:**

- `sprint-2-iteration-1/gate-report.json` — the unedited output of running the
  gate against the preserved rejected code:

  ```bash
  node .harness/checks/gate.mjs \
    --root=.harness/reviews/2026-09-22-shift-handover-bulk-status/sprint-2-iteration-1/rejected-code \
    --out=../gate-report.json
  ```

- `sprint-2-iteration-1/rejected-code/` — the actual first-attempt source, kept
  so the FAIL is reproducible rather than merely described.
- `sprint-2-iteration-2/gate-report.json` — the output of `npm run gate:full`
  against the merged code in this repository. Re-run it: the verdict is PASS
  with 0 blocking and 4 advisory findings.

**Agent-written records:** the `generator-summary.md`, `evaluator-feedback.md`,
`spec.md`, contract and `run-log.md` files — these are what the agents wrote
during the run, in the shape the templates prescribe.

**Sprint 1** has no machine-readable `gate-report.json` in this archive: its
gate run predates the code now on the branch (sprint 2 changed the same files),
so a JSON file presented as sprint 1's output would be a reconstruction. Its
verdict and findings are recorded in the Evaluator's own words instead. The
Monitor flags this as a harness improvement in `run-log.md` — the gate report
should be archived per iteration at the time it runs, not reconstructed after.
