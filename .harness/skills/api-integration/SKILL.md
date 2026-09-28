# API integration - StoreOps

Use plural lower-case paths under `/api`; register literal collection actions
before `/:id` routes. Validate with zod at the route edge while retaining
business invariants in the service for non-HTTP callers.

Success bodies use `{ "data": ... }`. Failures are produced only by the
error middleware and include stable `code`, `message`, `details`, and
`correlationId`; `BusinessRuleError` also exposes `rule`. Store isolation must
not trust a body-supplied user, role, or store.

Cross-module results are never assembled by writing sibling repositories.
Publish a typed event after the owning write and prove each subscriber effect
through its public API or service. See `api-conventions.skill.md` and
`event-integration.skill.md` for full examples.
