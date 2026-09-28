# Demonstration feature prompt

## Invocation

```text
@planner Add shift handover bulk update to activities.

Add PATCH /api/activities/bulk-status so outgoing-shift staff can mark
multiple operational activities as DONE or BLOCKED in one request. Support
partial failure: valid items must be updated while invalid or unauthorised
items are returned with stable error codes and rule identifiers. A BLOCKED
update requires a note. Write an append-only audit entry for every changed
activity. Publish one cross-module completion event after persistence so the
alerts module can create a SHIFT_HANDOVER notification and the reports module
can recompute the store summary. Preserve StoreOps module boundaries, typed
AppError handling, and the coverage thresholds in the project specification.
```

## Approval record

The Planner interpreted partial failure as HTTP 200 when at least one item is
updated and HTTP 422 when no item can be updated. It proposed a maximum batch
size of 50. The developer approved both decisions on 2026-09-22 before the
Generator/Evaluator loop began. The approval is preserved in the archived
[`spec.md`](.harness/reviews/2026-09-22-shift-handover-bulk-status/spec.md).

## Traceability

This is feature 1 from section 3.4 of the programme brief. The full evidence
chain is:

`PROMPT.md` -> archived `spec.md` -> sprint contracts ->
`active-rules.*.json` -> generator summaries -> evaluator verdicts ->
`run-log.md` -> final code and tests.
