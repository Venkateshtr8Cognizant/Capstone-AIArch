# Harness Design Brief

**StoreOps API - agentic development harness**  
**Track:** Solution Architect / Senior Architect Build Track  
**Demonstration feature:** shift handover bulk status update  
**Version:** 1.0 - 2026-09-28

This brief records the architectural intent behind the working harness. The
detailed engineering narrative remains in `docs/harness-design-brief.md`; this
submission version is organised around the four sections required by the
assessment brief.

## A. Intent decomposition

### From one feature request to bounded agent work

The feature request adds `PATCH /api/activities/bulk-status`, allowing an
outgoing shift to mark several activities `DONE` or `BLOCKED`, tolerate
per-item failures, append an audit entry per successful update, and trigger
alerts and reports without violating module ownership. That request exposes
all four client failure modes: a Generator could write directly to the alerts
repository (F1), throw raw errors for invalid batches (F2), prove only an HTTP
200 (F3), or omit the completion event while leaving the endpoint green (F4).

Responsibilities are separated by evidence produced, not by job title:

| Agent | Responsibility | Handoff |
| --- | --- | --- |
| Planner | Resolve ambiguity, enumerate rules, define sprint boundaries and decidable acceptance criteria | `spec.md`, sprint contracts, `active-rules.json` |
| Generator | Implement exactly one approved sprint and prove each criterion | code, tests, `generator-summary.md` |
| Evaluator | Independently run hard gates and assess criteria the scripts cannot judge | structured `evaluator-feedback.md` |
| Monitor | Record outcomes and trends without changing standards | archived `run-log.md` |

Two sprints were chosen. Sprint 1 contains the pure rule planner, service
operation, repository batch write, and unit tests for BR-1 through BR-9. It is
independently useful and testable without HTTP or cross-module effects.
Sprint 2 adds the route, event contract, alert/report subscribers, and
integration tests for BR-10 and BR-11 while re-verifying the earlier rules
through HTTP. This boundary keeps domain decisions stable before their wire
representation is built and makes the event integration visible as a separate
architectural concern.

Acceptance criteria use GIVEN/WHEN/THEN because each clause can become an
observable test setup, action, and assertion. Subjective phrases such as
"handles errors correctly" are excluded. Each rejection criterion names the
rule identifier expected in the API or per-item result, which lets both the
test suite and gate connect the approved intent to executable evidence.

Example contract entry (Sprint 1, AC-9):

> **GIVEN** a batch in which every item fails a per-item rule  
> **WHEN** the service executes the operation  
> **THEN** it throws `BusinessRuleError` with `rule: 'BR-9'`, status 422,
> and `details[]` carrying every item failure with its own rule identifier  
> **AND** no activity is modified.

This is testable because the error class, status, rule, details, and absence of
writes are all observable. The approved interpretation and all 22 criteria are
preserved in the demonstration archive.

## B. Governance framework

### Feedforward standards and independent evidence

The skill set is deliberately StoreOps-specific. `app-context` defines the
five modules and nine base endpoints. `architecture-principles` encodes the
three-layer model and the read-through-public-port/write-through-event-bus
rule. `coding-conventions` and `api-integration` cover strict TypeScript,
typed `AppError`, zod validation, response envelopes, and correlation IDs.
`how-to-test` fixes the 80/70/60/70 coverage floors and requires business-rule
assertions. `sprint-decomposition` guides the Planner. `how-to-review` and
`evaluation-criteria` guide independent review and deterministic verdicts.
The existing detailed skills remain as supporting references for the four
failure modes and their check identifiers.

Shared skills are loaded by every agent that needs the same architectural
language. Role-specific skills are loaded only where they influence a
decision. This is both a context-quality and cost decision: the Generator gets
the deepest context because it writes code; the Evaluator gets the contract
and review criteria instead of an independent domain backlog that could cause
it to invent requirements.

One governing rule is:

> A StoreOps module may read another module only through the target module's
> public `index.ts` read port. Cross-module side effects must be published as
> events after the owning repository write. Direct imports of a sibling
> repository, service, or subscriber are blocking failures.

Without that rule, the shortest implementation of the handover feature is for
`activities.service.ts` to instantiate `AlertRepository` and write a
notification directly. It works locally but makes activities own alerts
state, bypasses alerts policy, prevents independent evolution, and recreates
F1/F4. The rule is therefore encoded in skills, dependency checks, event
checks, and integration tests.

The `.harness/reviews/` archive is the permanent governance record. For every
sprint it retains the contract, Generator claim, machine-readable gate result,
Evaluator verdict, iteration number, and Monitor outcome. The failed first
attempt of Sprint 2 is retained with its rejected code and 23 blocking
findings, followed by the passing second attempt. A standards owner can
therefore distinguish a claim that the harness worked from evidence that it
rejected a real defect. The Monitor groups findings by F1-F4 and check ID;
recurrence of `EH-*`, rising iteration counts, or accumulating `EV-6`
advisories becomes a concrete signal to revise a skill or check.

The harness precedes and feeds CI; it does not replace CI. The same
`npm run harness:verify` command is suitable for local evaluation, a pipeline
stage, and the Docker build. CI remains responsible for branch protection,
credentialed deployment, and environment-specific checks.

## C. Non-determinism strategy

### Weighted dimensions

The Evaluator scores only after hard gates pass. The dimensions sum to 100%:

| Dimension | Weight | Deterministic floor | Judgement above the floor |
| --- | ---: | --- | --- |
| Architecture and governance | 40% | boundary, error, and event checks; typecheck | layer placement, correct error subtype, sufficient event payload |
| Behaviour and verification | 40% | tests, coverage thresholds, rule-ID traceability | criteria genuinely exercised; tests fail if the rule is removed |
| Operability and maintainability | 20% | build/smoke result and required handoff fields | auditability, correlation, duplication, future change risk |

The following hard gates cause immediate FAIL regardless of score:

- Any `MB-*` blocking finding prevents F1; an architectural boundary is not a
  quality preference that can be averaged against good test coverage.
- Any `EH-*` blocking finding prevents F2; raw errors destroy the API contract
  and misclassify caller mistakes as server faults.
- Any `TQ-*` blocking finding or unmet coverage floor prevents F3; a green
  status-only test cannot compensate for an unverified business rule.
- Any `EV-*` blocking finding prevents F4; missing or wrongly-owned event
  integration makes cross-module state inconsistent while the endpoint stays
  green.
- A failed typecheck, test run, or unmet acceptance criterion is also FAIL.

At least one automated check exists in each dimension: the architecture gate,
test/coverage gate, and build/smoke evidence respectively. Ambiguous Evaluator
output is never treated as PASS. A criterion marked `UNVERIFIABLE` is returned
as a Planner defect; missing evidence is `NOT MET`; a malformed verdict file
is a FAIL/retry rather than an assumed success.

The conversion from variable output to a deterministic verdict was exercised
in Sprint 2 iteration 1. The generated endpoint compiled and its tests passed,
but the gate reported three boundary, five error, eleven test-quality, and
four event findings. Since blocking count was greater than zero, the outcome
was FAIL without scoring debate. The Evaluator added file/line feedback; the
Generator replaced the duplicated inline loop with the Sprint 1 rule function,
published the event, and strengthened tests. Iteration 2 returned zero
blocking findings and 11/11 independently verified criteria, so the result was
PASS. The same inputs therefore always lead to the same routing decision.

After three failed Generator iterations in one sprint, the orchestrator writes
`.harness/output/escalation.md` and returns control to the developer/solution
architect. It names the sprint, iteration count, persistent findings,
files/lines, and one cause category: ambiguous contract, skill gap, technical
blocker, or contradictory constraints. Standards are never weakened during a
run to force convergence.

## D. Architectural decisions

### D1 - Split deterministic gates from LLM judgement

**Decision:** scripts run first and their blocking results cannot be
overruled; LLM judgement is used only for semantics the scripts cannot see.  
**Alternatives:** LLM-only review, or static checks alone.  
**Rationale:** LLM-only review can negotiate with a plausible justification;
scripts alone cannot decide whether a test meaningfully proves a rule or the
chosen `AppError` subtype is semantically correct.  
**Assumption:** the standards team maintains the checks and their fixtures as
the architecture evolves.

### D2 - Make approved intent machine-readable

**Decision:** the Planner writes `active-rules.json`, and gate rule `TQ-7`
requires every active rule identifier to appear in tests.  
**Alternatives:** compare prose contracts and tests manually, or rely only on
coverage.  
**Rationale:** coverage proves execution, not business intent. The rule list
creates a mechanical link from approval to verification while the Evaluator
checks that the reference is meaningful rather than a comment.  
**Assumption:** rule identifiers remain stable for the duration of a sprint.

### D3 - Use file handoffs and a bounded retry loop

**Decision:** agents communicate through versionable files; each sprint gets
at most three Generator attempts and a fresh scoped context.  
**Alternatives:** carry one long conversation across the run, or retry until a
PASS occurs.  
**Rationale:** files make every claim auditable and replayable. Context resets
reduce stale-instruction risk and token cost. Three attempts prevent an
ambiguous or contradictory contract from consuming unbounded effort.  
**Assumption:** one feature run owns `.harness/output/` at a time; concurrent
runs would require per-feature output directories.
