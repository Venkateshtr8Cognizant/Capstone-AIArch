# How to review StoreOps changes

Review the code and tests, not the Generator's claim. Run the full gate first;
any blocking finding, failed build step, or unmet criterion is FAIL and cannot
be negotiated into a conditional pass.

Then map every contract criterion to a named test or file/line. Confirm every
active rule is genuinely provoked, not merely mentioned. Inspect what scripts
cannot decide: correct `AppError` subtype, business logic placement, event
payload sufficiency, audit reconstruction, duplication/drift risk, and whether
the reports module remains read-only.

Feedback must identify file, line, rule/check ID, why it fails, and the
observable condition for resolution. Do not provide replacement code.
