# Architecture journal

## 2026-09-20 - Choose a governed reference boundary

**Decision:** keep the application and harness in one repository, but isolate
harness assets under `.harness/` rather than `.github/`.  
**Trade-off:** agents can read source and governance rules in one checkout,
but repository contributors must understand that `.harness/output/` is
working state while `.harness/reviews/` is permanent evidence.  
**Insight:** separating harness files from CI configuration makes it clear
that the Evaluator feeds pipeline gates rather than impersonating the
pipeline.

## 2026-09-21 - Treat rules as identifiers, not prose

**Decision:** number business rules and carry the identifier from contract to
`BusinessRuleError`, API output, tests, and `active-rules.json`.  
**Alternative:** use descriptive acceptance criteria only.  
**Trade-off:** identifiers require lifecycle discipline, but allow mechanical
traceability and stable client behaviour even when messages change.  
**Insight:** line coverage and intent coverage are different; TQ-7 exists to
make that difference visible.

## 2026-09-22 - Split the demonstration into rules, then integration

**Decision:** implement the pure bulk plan and service write before HTTP and
events.  
**Alternative:** deliver the endpoint vertically in one sprint.  
**Trade-off:** two contracts add orchestration overhead, but isolate business
decisions from transport and cross-module wiring.  
**Insight:** the pure planner made 29 rule cases cheap and exposed an all-fail
batch before any write, avoiding rollback semantics.

## 2026-09-22 - Preserve the failed iteration

**Decision:** archive the rejected Sprint 2 code and gate output.  
**Alternative:** retain only the final PASS artefacts.  
**Trade-off:** the repository is larger, but the primary claim - that the
harness prevents real defects - is reproducible.  
**Insight:** a gate never observed to fail is indistinguishable from a gate
that does nothing; this led to the five-fixture gate self-test.

## 2026-09-22 - Bound autonomy at three attempts

**Decision:** after three FAIL verdicts in one sprint, classify and escalate
instead of retrying.  
**Alternative:** loop until PASS or require approval after every iteration.  
**Trade-off:** the bound can stop a recoverable fourth attempt, but avoids
unbounded token spend and prevents silent relaxation of standards.  
**Insight:** repeated failure usually indicates an instruction, skill, or
architecture problem rather than lack of another code generation attempt.

## 2026-09-28 - Separate verified facts from submission gaps

**Decision:** publish the 101-test, coverage, and 33/33 smoke evidence while
explicitly marking Docker execution and screenshot evidence outstanding.  
**Alternative:** imply that a reviewed Dockerfile is deployed evidence.  
**Trade-off:** the submission retains one visible completion task, but the
audit record remains trustworthy.  
**Insight:** governance credibility depends as much on declaring what was not
verified as on documenting what passed.
