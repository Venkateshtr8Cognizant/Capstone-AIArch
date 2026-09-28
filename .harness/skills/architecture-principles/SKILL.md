# Architecture principles - StoreOps

## Purpose

Preserve module ownership and the three-layer design while adding features.

## Non-negotiable rules

1. Routes validate HTTP input and call services; they contain no business
   rules and never construct 4xx/5xx responses directly.
2. Services own business rules and use only their own repository.
3. Repositories own persistence and never call routes, services, or external
   modules.
4. A cross-module read uses a public read port exported by the target module's
   `index.ts` and injected at composition.
5. A cross-module side effect uses `EventBus.publish()` after the owning write.
   Subscribers write only their own module state.
6. `reports` is read-only with respect to activities, programmes, and staff.
7. Every service/route error is an `AppError` subtype with stable code, status,
   and correlation ID.

Violating rules 4-6 is a blocking F1/F4 failure. Violating rule 7 is F2.
Detailed examples and gate mappings are in the legacy
`module-boundaries.skill.md`, `event-integration.skill.md`, and
`error-handling.skill.md` references.
