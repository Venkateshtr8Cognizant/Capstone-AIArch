# Run log — <feature name>

> Written by the **Monitor** after every sprint verdict, including escalations.
> This is the governance audit trail and the primary input for detecting skill
> file drift.

**Run:** <YYYY-MM-DD> · **Feature:** <slug> · **Harness version:** <git sha or tag>

## Sprint outcomes

| Sprint | Iterations (of 3) | Verdict | Escalated | Blocking findings | Advisory | Criteria met |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | /  |
| 2 | | | | | | /  |

## Findings by failure mode

| Mode | Iteration 1 | Iteration 2 | Iteration 3 | Reached main |
| --- | --- | --- | --- | --- |
| F1 boundaries | | | | 0 |
| F2 errors | | | | 0 |
| F3 test quality | | | | 0 |
| F4 events | | | | 0 |

The `Reached main` column should be 0 in every row. A non-zero entry is the
harness having failed at its one job, and requires a written explanation.

## Findings by check

| Check | Rules fired | Count |
| --- | --- | --- |

## Quality signals

- **Coverage:** overall <x>%, service layer <y>% (thresholds 70% / 80%)
- **Test count:** <n> (<u> unit, <i> integration)
- **Gate runtime:** static <a>s, full <b>s

## Cost

| Agent | Invocations | Est. tokens | Basis |
| --- | --- | --- | --- |
| Planner | | | |
| Generator | | | |
| Evaluator | | | |
| Monitor | | | |
| **Total** | | | |

Estimated, not measured. State the basis (skill context per CLAUDE.md §6 plus
observed input/output). A consistently-derived estimate makes the trend
visible; precision is not the point.

**Wall-clock:** first Generator invocation to final verdict — <duration>.

## Quality trend

<Compare with previous entries in `.harness/reviews/`. Name what you can see:
a rule that has now fired in more than one run; iteration counts trending up;
a check that never fires; advisory findings accumulating unfixed.>

## Recommended harness changes

At most two, each with the evidence that prompted it. Recommendations only —
the Monitor does not edit skills, checks or agents.

| # | Change | Evidence | Rationale |
| --- | --- | --- | --- |

## Escalations

| Sprint | Iteration | Cause category | Resolution |
| --- | --- | --- | --- |

Cause categories: ambiguous contract · skill file gap · technical blocker ·
contradictory constraints.

## Archive

Archived to `.harness/reviews/<YYYY-MM-DD>-<feature-slug>/`, including
per-iteration artefacts so the FAIL→PASS path is auditable and not just the
final state.
