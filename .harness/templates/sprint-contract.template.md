# Sprint <N> contract — <feature name>

> Written by the **Planner**. This is the Generator's entire scope and the
> Evaluator's entire basis for judgement. If something is not in here, it is
> not in this sprint.

## Scope

**In:** <the specific layers, files and behaviours>

**Out:** <what belongs to another sprint, named explicitly>

## Carried-in work

<Required follow-ups from a previous sprint's CONDITIONAL PASS. `None` if
there are none.>

## Business rules in this sprint

| Rule | Statement | Enforced where | Outcome when violated |
| --- | --- | --- | --- |
| BR-1 | | | |

## Acceptance criteria

Each criterion is GIVEN/WHEN/THEN, names the rule it verifies, and is
mechanically checkable.

### AC-1 — <short title> (BR-1)

- **GIVEN** <starting state>
- **WHEN** <action>
- **THEN** <observable, checkable outcome>

### AC-2 — <short title> (BR-2)

- **GIVEN**
- **WHEN**
- **THEN**

## Files expected to change

| File | Purpose | Criteria served |
| --- | --- | --- |

## Definition of done

- `npm run gate:full` is PASS with zero blocking findings.
- Every acceptance criterion is MET, with file:line or test-name evidence.
- Every rule id in `active-rules.json` is asserted by at least one test that
  provokes it.
- Coverage thresholds hold (service 80%, routes 70%, shared 60%, overall 70%).
- No changes outside the scope above.
