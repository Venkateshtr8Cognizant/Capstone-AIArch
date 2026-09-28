# Sprint 2, iteration 1 — rejected code (preserved)

This is the Generator's **actual first attempt** at sprint 2, kept so the FAIL
verdict is reproducible rather than merely described. It contains all four
failure modes the harness exists to prevent.

Re-run the gate against it yourself:

```bash
node .harness/checks/gate.mjs \
  --root=.harness/reviews/2026-09-22-shift-handover-bulk-status/sprint-2-iteration-1/rejected-code \
  --out=../gate-report.json
```

The `gate-report.json` in the parent directory is the unedited output of that
command.

**Do not copy any of this code.** It is excluded from `tsconfig.json` and
`vitest.config.ts`. Several files reference modules that are not part of this
subtree — that is deliberate: the tree is the minimum needed for the static
checks to reproduce the findings, not a runnable application.

## What the Generator got wrong, and why it is instructive

The striking thing about this attempt is that it is *plausible*. The endpoint
works. The tests are green. A reviewer skimming the diff for "does it do the
thing" would approve it. Every defect is a shortcut that looks like
pragmatism:

| Mode | The shortcut | What it actually cost |
| --- | --- | --- |
| **F1** | `new InMemoryAlertRepository().save(...)` inside the activities service — "it's just one insert" | The alerts module's channel routing, initial `PENDING` status, and its own `alerts.notification.created` event are all skipped. The recipient is hardcoded to `user_sam` instead of resolved from the roster. |
| **F2** | `throw new Error('taskIds must not be empty')` — "it's validated at the edge anyway" | A client mistake returns 500 `INTERNAL_ERROR` and pages on-call. No `rule`, so no rule-level test is possible. |
| **F3** | `expect(response.status).toBe(200)` — "the endpoint returns 200, so it works" | Green, fast, full line coverage of the handler, and blind to whether anything was updated, which items were rejected, or why. |
| **F4** | No `events.publish(...)` — the endpoint's own response looked complete | No `SHIFT_HANDOVER` alert for the incoming shift; no `STORE_SUMMARY` recompute. Nothing fails. The feature silently does two thirds of its job. |

F3 and F4 are the pair that matter most: **the missing event is invisible
precisely because the tests only assert status codes.** A status-only test
suite cannot distinguish this implementation from the correct one. That is why
the harness needs both `TQ-2` and `EV-1` — either alone would have let this
through.
