# Gate fixtures — the harness's own test suite

Each directory below is a miniature StoreOps tree containing a **deliberate**
violation of one of the four failure modes the client's standards team asked us
to prevent. `node .harness/checks/selftest.mjs` runs the checks against each
fixture and asserts that the expected rule ids fire — and that the clean
fixture produces no blocking findings at all.

| Fixture | Failure mode | Must be caught by |
| --- | --- | --- |
| `f0-clean/` | none — control | nothing (0 blocking findings) |
| `f1-repository-import/` | F1 direct sibling repository import | `MB-1`, `MB-6`, `EV-5` |
| `f2-raw-error/` | F2 raw `Error` throws in a service | `EH-1`, `EH-2`, `EH-3`, `EH-4`, `EH-5` |
| `f3-status-only-test/` | F3 status-code-only tests | `TQ-2`, `TQ-3`, `TQ-4` |
| `f4-missing-event/` | F4 missing event bus integration | `EV-1`, `EV-2`, `EV-3` |

These files are excluded from `tsconfig.json` and from `vitest.config.ts`: they
are data for the checks, not part of the application, and several of them do
not compile on purpose.

**Why this exists.** A governance gate that has never been shown to fail is
indistinguishable from a gate that does nothing. The self-test is the evidence
that each rule fires on the code pattern it claims to prevent, and it runs in
CI as `npm run gate:selftest`, so a refactor of a check cannot silently
disable it.
