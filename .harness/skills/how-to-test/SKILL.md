# How to test StoreOps

Coverage floors are service 80%, route/controller 70%, shared utilities 60%,
and overall 70%. `vitest.config.ts` is authoritative and must not be weakened
during a sprint.

Every active business rule needs a test that provokes the rule and asserts its
stable rule ID or state consequence. HTTP tests must assert body/state/event
behaviour in addition to status. For mutations, verify accepted and rejected
items, unchanged state on failure, append-only audit effects, event count and
payload, and subscriber effects through the owning module.

Run `npm run gate` while editing and `npm run gate:full` before handoff. The
Evaluator applies a deletion test: if removing the rule would leave all tests
green, the test is not meaningful. Full patterns are in
`testing-standards.skill.md`.
