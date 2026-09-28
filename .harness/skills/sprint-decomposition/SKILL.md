# Sprint decomposition - StoreOps

## Planner guidance

Turn a feature prompt into numbered atomic business rules, then group rules so
each sprint is independently testable. Prefer: Sprint 1 pure domain logic and
service/repository behaviour; Sprint 2 HTTP and event integration; Sprint 3
only for a genuinely separate concern such as migration or scheduled work.

Every criterion must use GIVEN/WHEN/THEN, name its rule IDs, and state an
observable outcome. Include happy path, request rejection, item-level failure,
authorization/store isolation, audit behaviour, and event ownership where
applicable. Never use subjective criteria such as "clean" or "robust".

Emit `active-rules.json` with the current sprint's IDs so TQ-7 can require a
test reference for each approved rule. Declare scope exclusions and
interpretations before the `STATUS: AWAITING APPROVAL` marker.
