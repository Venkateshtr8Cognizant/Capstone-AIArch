# Coding conventions - StoreOps TypeScript

Use strict TypeScript and existing module factories. Do not introduce `any`,
non-null assertions for domain state, default mutable singletons, or direct
wall-clock/random calls when `Clock` and ID ports are available. Keep business
decisions in pure `*.rules.ts` functions where possible.

All service and route failures use the correct `AppError` subtype. A named
business-rule rejection uses `BusinessRuleError(ruleId, message, options)`;
raw `Error`, strings, and hand-built error responses are blocking failures.

Sequence service work as read -> evaluate -> write own state -> publish. Pass
the request correlation ID into errors, events, and structured logs. Detailed
examples are in `error-handling.skill.md`.
