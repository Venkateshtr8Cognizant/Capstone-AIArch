# Reflection

The harness performed best where the project had explicit, machine-readable
standards. The first Generator attempt for Sprint 2 compiled, passed its own
tests, and implemented a working endpoint, but still recreated every client
failure mode: sibling repository access, raw/hand-built errors, status-focused
tests, and missing event integration. The deterministic gate found 23
blocking issues and forced a FAIL. The file-and-line feedback was specific
enough for the next Generator context to recover without developer
intervention. Replacing the duplicated inline implementation with the Sprint
1 rule function was especially valuable: it restored the BR-7 permission rule
by design rather than by adding another patch.

The strongest governance choice was the split between scripts and reviewer
judgement. Scripts made boundary, error, test-shape, and event-catalogue rules
non-negotiable. The Evaluator then checked what the scripts could not: whether
a test would fail if a rule were removed, whether the error subtype was
honest, and whether an event payload let subscribers act without calling back
into the publisher. The review archive makes the FAIL-to-PASS path auditable
rather than asking a reviewer to trust the final green build.

The main limitation is that syntactic gates prove the presence of known
patterns, not completeness of architectural intent. The smoke run exposed one
example: blocking a HIGH activity in the bulk path produces the bulk-completed
event but no escalation alert, because that policy listens to a different
event. Every current gate and contract criterion passes; none can infer that a
second subscriber ought to exist. The deployment evidence also remains
incomplete because Docker is unavailable on the authoring workstation; the
local 33/33 real-server run proves application behaviour, not container
execution.

The next improvement is to implement recommendation R-2 from the Monitor:
make the orchestrator reject a `generator-summary.md` unless its gate table is
backed by the current machine-readable `gate-report.json`, and treat every
empty acceptance-evidence cell as `NOT MET`. This follows Design Brief D2
(machine-readable intent) and addresses the most costly failure observed in
the run: iteration 1 confidently reported zero gate findings after running
only its own tests. It is concrete, automatable, and should eliminate a full
Evaluator/Generator cycle without weakening any standard.
