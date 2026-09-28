# Evaluator feedback — sprint <N>, iteration <I>

> Written by the **Evaluator**. On FAIL this is the Generator's primary input
> for the next iteration, so every finding must be actionable by an agent with
> no memory of this review.

## Verdict

**<PASS | CONDITIONAL PASS | FAIL>**

<One paragraph: what was judged, and the single decisive reason for this
verdict.>

## Gate result (deterministic — not subject to review judgement)

```
$ npm run gate:full
<verdict line>
```

| | Blocking | Advisory |
| --- | --- | --- |
| F1 boundaries | | |
| F2 errors | | |
| F3 test quality | | |
| F4 events | | |
| typecheck | pass/fail | |
| tests + coverage | pass/fail | |

## Acceptance criteria — independently verified

| Criterion | Rule | Generator claimed | Evaluator verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-1 | BR-1 | MET | MET / NOT MET / UNVERIFIABLE | |

<Call out explicitly any criterion the Generator marked MET that you found
NOT MET — that is the most important line in this report.>

## Rule coverage

| Rule | Test that provokes it | Meaningful? | Note |
| --- | --- | --- | --- |

"Meaningful" means: if the rule check were deleted from the source, this test
would fail.

## Findings

Ordered by severity. The Generator works top-down and may run out of context.

### Blocking

#### B-1 — <rule id> — `<file>:<line>`

- **What:** <the defect, precisely>
- **Why it matters:** <the failure mode or contract rule it breaks>
- **Required change:** <what "fixed" looks like, specifically>

### Advisory

#### A-1 — <rule id> — `<file>:<line>`

- **What:**
- **Suggested change:**

## Required follow-ups (CONDITIONAL PASS only)

<Items the orchestrator must copy into the next sprint contract's
`Carried-in work`. Only valid when every criterion is MET and there are no
blocking findings.>

## Evaluator notes

<Judgement that the gate cannot express: design concerns, test theatre that
passed the checks, an error class that is technically valid but semantically
wrong, a payload a subscriber cannot act on. Also record any disagreement with
a gate finding — that note is the Monitor's signal that a check may be
mis-calibrated.>
