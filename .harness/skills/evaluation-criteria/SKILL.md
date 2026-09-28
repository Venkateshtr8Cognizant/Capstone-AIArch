# Evaluation criteria - StoreOps harness

## Dimensions

- Architecture and governance - 40%.
- Behaviour and verification - 40%.
- Operability and maintainability - 20%.

## Hard gates

Any blocking `MB-*`, `EH-*`, `TQ-*`, or `EV-*` finding; typecheck/test/coverage
failure; or `NOT MET` acceptance criterion yields FAIL regardless of weighted
score. A malformed or ambiguous verdict is not a PASS. `UNVERIFIABLE` is a
Planner defect and must be routed for contract correction.

PASS requires zero blocking findings and every criterion MET with evidence.
CONDITIONAL PASS is available only for advisory debt with explicit follow-up.
FAIL retries the Generator up to three total attempts; the third FAIL produces
an escalation naming sprint, persistent findings, files/lines, change history,
and cause category.
