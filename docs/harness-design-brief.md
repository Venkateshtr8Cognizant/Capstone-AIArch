# Harness Design Brief

**StoreOps API — agentic development harness**
Solution Architect capstone · AI Native Tech Architect programme
Version 1.0 · 2026-09-22

---

## 1. Context and problem

An eight-developer squad at a retail client is building the StoreOps API. The
CTO has approved AI-assisted development with Claude Code. The engineering
standards team has blocked the rollout, and their objection is specific rather
than cultural: a prior AI-assisted pilot put four defects on the main branch.

| | Failure mode |
| --- | --- |
| **F1** | Direct imports from another module's repository, bypassing the agreed service boundary and event bus |
| **F2** | Raw `Error` throws in service methods, bypassing the typed `AppError` hierarchy |
| **F3** | Tests that asserted HTTP status codes but did not verify business rule compliance |
| **F4** | Missing event bus integration — state changes written directly to sibling module repositories |

The instructive thing is that none of these is a coding-competence failure.
Each is a **local optimum**: the shortest path from "make this work" to working
code. Importing the sibling repository is one line and it compiles. Throwing
`new Error` is shorter than choosing from a seven-class hierarchy. Asserting
`200` is a real test that really passes. Omitting an event publication breaks
nothing that the endpoint's own response can reveal.

An AI coding agent optimises for exactly what it is asked, and local optima are
what it finds. The gap is not model capability; it is that **the project's
architectural constraints are not present at the moment of writing**. They live
in a wiki, in reviewers' heads, and in code the agent never reads.

The harness closes that gap two ways: it puts the constraints in front of the
agent *before* it writes (feedforward context), and it makes a deterministic
accept/reject decision *after* it writes (the gate). Neither alone is enough,
and section 4 explains why.

### Non-goal

This harness does not try to make the model produce better code in general. It
makes a specific set of project standards unavoidable. That narrowness is what
makes it maintainable by the squad rather than by its author.

---

## 2. Five design decisions

Everything else follows from these.

**D1 — Split the review into a deterministic half and a judgement half.**
The Evaluator runs a script-based gate first and may not overrule it. A
blocking finding is a FAIL, full stop. Only after the gate is clean does the
agent spend judgement on what a script cannot see. *Rationale:* the reason to
add a reviewing agent is to catch what scripts miss, but an agent that can
negotiate with a rule is not a control. Rule 1 of §7 of `CLAUDE.md` exists
because in testing, an LLM reviewer given a blocking finding and a plausible
justification will sometimes accept the justification.

**D2 — Encode standards as prevented defects, not as rules.**
Every skill file states the rule, then shows the **actual wrong code** and the
correct version beside it. *Rationale:* "use the typed error hierarchy" is a
rule an agent will agree with and then not follow. `throw new Error('taskIds
must not be empty')` next to "what the client sees: HTTP 500 `INTERNAL_ERROR`,
on-call paged for a client mistake" is recognisable in the agent's own output.

**D3 — Make intent machine-checkable.**
The Planner emits `active-rules.json` alongside the prose contract; the gate's
`TQ-7` rule fails the sprint if any listed rule id is never named in a test.
*Rationale:* the weakest link in AI-assisted delivery is between what was
agreed and what was verified. Without a mechanical link, "the tests pass" and
"the acceptance criteria are met" are independent claims.

**D4 — Give the loop a hard iteration limit and a typed escalation.**
Three Generator iterations per sprint, then stop and classify the cause as
ambiguous contract, skill file gap, technical blocker or contradictory
constraints. *Rationale:* by the fourth attempt on the same feedback, the
defect is usually in the *instruction*, and further iterations burn tokens
converging on a contract that cannot be satisfied.

**D5 — The Monitor recommends; it never edits.**
It writes the run-log and proposes at most two harness changes with evidence.
*Rationale:* a governance system that rewrites its own rules without a human is
not a governance system. Standards change deliberately, between sprints, on
evidence.

---

## 3. Architecture

```
                      developer prompt
                            │
                  ┌─────────▼─────────┐
                  │      PLANNER      │  skills: domain, api-conventions
                  └─────────┬─────────┘
       spec.md · sprint-N.contract.md · active-rules.json
                            │
                     developer: APPROVED
                            │
      ╔═════════════════════▼══════════════════════════════════╗
      ║  per sprint, autonomous                                ║
      ║                                                        ║
      ║   ┌─────────────┐   code + tests + generator-summary   ║
      ║   │  GENERATOR  │──────────────────┐                   ║
      ║   └──────▲──────┘                  │                   ║
      ║          │                   ┌─────▼──────┐            ║
      ║          │  feedback         │ EVALUATOR  │            ║
      ║          └───────────────────┤  ┌───────┐ │            ║
      ║            FAIL, iter < 3    │  │ GATE  │ │ ← script   ║
      ║                              │  └───────┘ │            ║
      ║                              └─────┬──────┘            ║
      ║                                    │ verdict           ║
      ║   ┌───────────┐                    │                   ║
      ║   │  MONITOR  │◀───────────────────┘                   ║
      ║   └─────┬─────┘  run-log.md → .harness/reviews/        ║
      ╚═════════▼══════════════════════════════════════════════╝
         next sprint · or escalate after 3 iterations
```

**Agents communicate only through files** in `.harness/output/`. Nothing passes
between them in conversation. This costs some efficiency and buys three things:
the archive in `.harness/reviews/` is a complete audit trail; any agent can be
re-run from the files alone; and a handoff that is hard to write down is a
design smell that surfaces early.

**`CLAUDE.md` is the orchestrator**, not documentation. Claude Code reads it on
launch; it defines the agents by reference, the sequence, and the routing
table. The routing rules are deliberately written as a table with no
discretion: PASS advances, FAIL returns to the Generator, three FAILs escalate.

**Context is budgeted per agent** (`CLAUDE.md` §6). The Generator loads all six
skills (~12k tokens) because it is the only agent that writes code and all four
failure modes are writing mistakes. The Evaluator loads four (~9k) and
deliberately **not** the domain skill: judged against the contract, an Evaluator
with independent domain knowledge invents requirements the Planner never agreed
and the Generator was never told. The Monitor loads none.

Each sprint starts with a **fresh Generator context** seeded by the sprint
contract, the previous summary and the skills. In the demonstration run this
saved an estimated 15–20k tokens, but the real reason is correctness: carrying
a full conversation lets a superseded instruction survive past its correction.

---

## 4. The deterministic / non-deterministic split

This is the core of the design, so it is worth being precise about which
failures belong to which half.

**The gate (deterministic).** Four dependency-free Node scripts, ~0.2 seconds
total, no npm install and no build step — so they run identically on a laptop,
in CI, and inside the Docker build. Each rule maps to one failure mode:
`MB-1`…`MB-7` (F1), `EH-1`…`EH-7` (F2), `TQ-1`…`TQ-7` (F3), `EV-1`…`EV-7` (F4).
Findings are `blocking` or `advisory`; one blocking finding is a FAIL.

Two rules show why syntactic checks are worth writing even when they look
crude:

- **`EV-1`** checks the *event catalogue*, not the code: every event declared
  in `EVENT_OWNERS` must have a publisher. This catches F4 — a declared channel
  nobody publishes on — which no reviewer finds by reading a diff, because
  there is nothing in the diff to see.
- **`TQ-2`** flags a test that asserts a status code and nothing else. This is
  the check that makes the others effective: in the demonstration run the
  missing event was undetectable *because* the tests asserted only status
  codes. F3 is what lets every other failure mode survive review.

**The Evaluator (judgement).** Spent only on what a script cannot see:

- *Would this test fail if the rule were deleted?* Coverage cannot answer this.
  A status-only test gives 100% line coverage of its handler.
- *Is this the right error class?* `EH-1` proves an `AppError` was thrown. A
  `NotFoundError` where a `ConflictError` belongs passes the gate and misleads
  every client.
- *Can a subscriber act on this payload?* `EV-1` proves the event is published.
  A payload that forces the subscriber to call back into the publisher passes
  every check while reintroducing F1.
- *Is business logic leaking into routes? Is a rule duplicated so the copies
  can drift?*

**And what neither half can do.** The demonstration run surfaced a real
behavioural inconsistency — a `CRITICAL` activity blocked in a handover raises
no escalation, because the alerts subscriber listens for a different event
(backlog F-5). Every relevant check passed: the event is published, the payload
is sufficient, every contract rule is asserted. What no check can know is that
*a second subscriber should have been interested*. Deciding which events a
module ought to care about is architectural intent, and it stays with the
developer. A harness that claimed to cover this would be overselling itself;
what it can do is make the gap cheap to find, which is how it was found — by
the smoke run, in the open.

### Trusting the gate

A gate never observed to fail is indistinguishable from a gate that does
nothing. `npm run gate:selftest` runs the checks against five fixture trees —
one clean control, one per failure mode — and asserts the expected rule ids
fire and that the control is clean. It is part of `harness:verify`, so
refactoring a check cannot silently disable it. Current result: **5/5, F1–F4
all provably caught.**

---

## 5. From intent to verification

The chain that connects a developer's sentence to a passing test:

```
"Add shift handover bulk update"
   → spec.md              interpretation, failure-mode surface, 11 rules
   → sprint-N.contract.md GIVEN/WHEN/THEN criteria, each naming a rule
   → active-rules.json    the same rule ids, machine-readable
   → BusinessRuleError('BR-3', …)   the rule id reaches the API response
   → expect(body.error.rule).toBe('BR-3')   the test asserts the rule
   → TQ-7                 gate fails if any contract rule is unasserted
```

Three properties matter. **Rules are decidable** — a criterion is "the response
body contains `error.rule === 'BR-3'`", never "the code is clean", because two
reviewers must reach the same verdict for the loop to be autonomous. **The rule
id is carried in the type system** — `BusinessRuleError` takes it as its first
constructor argument and `EH-5` enforces that, so it cannot be lost between the
contract and the client. **The Planner writes the interpretation down** — the
StoreOps spec's partial-failure decision was ambiguous in the original request;
the Planner adopted a reading, argued it in `spec.md`, and the developer
confirmed it in one word.

`TQ-7` has an accepted limitation: a rule id in a comment satisfies it.
Closing that syntactically would mean reimplementing a test runner. It is
instead the Evaluator's Step 3 — confirm the named test actually provokes the
rule. This is the split working as intended: the script proves the link exists,
the agent proves the link is real.

---

## 6. Evaluation criteria

| Verdict | Conditions — all must hold |
| --- | --- |
| **PASS** | Gate PASS, zero blocking; every criterion MET with evidence; every rule covered by a meaningful test; no material design concern |
| **CONDITIONAL PASS** | Gate PASS, zero blocking; every criterion MET; non-blocking quality debt, listed as required follow-ups that the orchestrator copies into the next sprint contract |
| **FAIL** | Any blocking finding, any failed build step, any criterion NOT MET, or any rule with no meaningful test |

CONDITIONAL PASS is available **only** for advisory-level debt. It is not a
route for accepting a blocking finding, and the Evaluator is instructed
accordingly, because a conditional pass that can absorb a blocking finding is
just a pass with paperwork.

Feedback is written to be acted on by an agent with no memory of the review:
`file:line`, the rule id, and what "fixed" looks like — but never the
replacement code. Pasting an implementation removes the Generator's ability to
solve the problem in context, and it hides whether the skill files were
sufficient, which is the signal the Monitor needs.

---

## 7. Observability and tuning

The Monitor runs after every verdict and records, per sprint: iterations used,
verdict, escalation flag, findings by failure mode *and* by check, criteria met
versus claimed, coverage, estimated token cost, wall-clock, and carried-in
work. Cost is explicitly an estimate with a stated basis; a consistently
derived estimate makes the trend visible, and a wrong number presented as exact
is worse than an honest one.

What the archive is for:

- **Skill file drift.** A rule that fires in more than one run means the
  matching skill is not landing at the point of writing. In this run the
  Evaluator's diagnosis was precise: "the Generator's failure was not knowing
  how — it was not noticing that the publish was missing." That produced
  recommendation R-1 (a self-check list at the end of every skill), which has
  been implemented.
- **Contract quality.** Iteration counts trending up means contracts are
  getting less precise, not that the model is getting worse.
- **Dead checks.** A check that never fires is either an internalised standard
  or a broken check, and the archive is the only way to tell which.
- **Deferred debt.** Advisory findings that accumulate across runs without ever
  being cleared mean CONDITIONAL PASS is being used as a bin.

Baseline established by this run: 11.5 blocking findings per sprint, 1.5
iterations per sprint, 0 escalations, 0 findings reaching main, 4 `EV-6`
advisories, 93.2% coverage.

---

## 8. Evidence

One feature, two sprints, three Generator invocations
(`.harness/reviews/2026-09-22-shift-handover-bulk-status/`).

| | Sprint 1 | Sprint 2 iter 1 | Sprint 2 iter 2 |
| --- | --- | --- | --- |
| F1 boundaries | 0 | **3** | 0 |
| F2 errors | 0 | **5** | 0 |
| F3 test quality | 0 | **11** | 0 |
| F4 events | 0 | **4** | 0 |
| Criteria met | 11/11 | **4/11** | 11/11 |
| Verdict | PASS | **FAIL** | PASS |
| typecheck | pass | **pass** | pass |
| tests | pass | **pass** | pass |

The two bold "pass" cells in the FAIL column are the argument for the harness.
Sprint 2's first attempt had a working endpoint, green tests, a clean
typecheck, and 100% line coverage of the handler under review. It also wrote
directly into the alerts module's repository with a hardcoded recipient, never
published the event two other modules depend on, and had silently dropped the
permission rule — so any authenticated colleague could close any activity in
their store. `npm test` would have merged all of it.

The Generator's own summary reported four zeros in its gate table, having run
only `npm test`, and marked three criteria MET with no evidence. That
self-report is preserved unedited in the archive, because a confidently wrong
self-assessment is the failure mode the Evaluator's independent re-verification
exists to catch, and it produced recommendation R-2.

Recovery took one iteration and no human involvement. The fix was structural:
the Generator deleted its inline rule loop and called the sprint-1 rule
function, which restored the permission check for free — one implementation of
a rule being worth more than any number of tests over two.

**End-to-end**: `npm run smoke` builds, starts a real server and drives the
feature over HTTP — 33/33 checks, including the partial-failure response, the
typed 422s with rule ids, the `SHIFT_HANDOVER` alert arriving by event bus, and
correlation ids threaded from request through event to log line.

---

## 9. Limitations

Stated plainly, because a governance design that hides its edges cannot be
adopted safely.

1. **The checks are syntactic, not semantic.** Regex and brace-matching over
   comment-stripped source. They will miss a boundary violation constructed
   through a dynamic import or an indirection, and a determined agent could
   evade them. The compensating controls are the type system (read ports are
   read-only interfaces), the Evaluator, and `CLAUDE.md` rule 2 — editing a
   check during a sprint is out of scope for the Generator, full stop.
2. **`TQ-7` accepts a rule id in a comment.** Documented in §5; mitigated by
   the Evaluator's Step 3.
3. **One reference project.** The checks know StoreOps' file naming
   (`<module>.service.ts`, `<module>.subscribers.ts`). Porting to another
   codebase means changing those patterns — about a day's work, concentrated in
   four files with a self-test to confirm it still works.
4. **Cost is estimated, not instrumented.** ~144k tokens for this run, of which
   the failed iteration was ~41k (28%). A real deployment should capture actual
   usage per agent invocation rather than inferring it.
5. **Single-writer assumption.** One feature at a time through
   `.harness/output/`. Two concurrent features would collide on the handoff
   files; the fix is a per-feature subdirectory, not yet built.
6. **Container evidence outstanding.** Docker is not installed on the
   workstation this was built on, so `Dockerfile` and `docker-compose.yml` are
   reviewed but unexecuted. `npm run smoke` is the substitute running-application
   evidence.

### What I would change next

- **R-2 from the run-log**: have the orchestrator reject a generator summary
  whose gate table was not produced by a real gate run, and treat an empty
  evidence cell as NOT MET. Mechanical, and it removes the largest source of
  wasted effort in this run.
- **Archive `gate-report.json` per iteration at the time it runs.** Sprint 1
  has no machine-readable report because reconstructing one afterwards would
  not be evidence.
- **Add a check for `AppError` class *choice*, not just presence** — for
  example, flag a `NotFoundError` raised inside a status-transition guard,
  where `ConflictError` is almost certainly meant. Currently judgement-only.

---

## 10. Adoption path for the squad

1. **Week 1 — gate only, advisory.** Run `npm run gate` in CI as a
   non-blocking report. The squad sees what it would have flagged on their own
   commits, and calibration arguments happen before anything is enforced.
2. **Week 2 — gate blocking on new code.** Blocking findings fail the build for
   changed files. Fix the backlog the advisory week exposed.
3. **Week 3 — Planner and the contract discipline, no autonomy.** Developers
   write specs and `active-rules.json` by hand with the Planner's help. This is
   where most of the value lands, and it lands with or without the loop:
   decidable acceptance criteria improve human review too.
4. **Week 4 — the autonomous loop, one feature at a time**, with the Monitor
   archiving every run. Review the archive at the end of each sprint.

The order is deliberate. The gate is useful without the agents; the contracts
are useful without the loop; the loop is only safe once the first two are
trusted. A squad that adopts the loop first has automated an unmeasured
process.

**Ownership.** The skill files and checks belong to the standards team, not to
the harness's author. They are plain markdown and dependency-free JavaScript
for that reason: a senior engineer can read `check-errors.mjs` end to end in
ten minutes and change a rule with a fixture to prove it still fires. A
governance system nobody on the team can modify is a governance system that
will be bypassed.
