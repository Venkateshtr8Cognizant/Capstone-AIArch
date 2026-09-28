# CLAUDE.md — StoreOps development harness (root orchestrator)

You are operating inside the **StoreOps API** repository under a governed
agentic harness. This file is the orchestrator: it defines the agents, the
sequence they run in, the files they hand to each other, and the routing
rules you apply to their verdicts.

Read this file fully before acting. When a developer prompt arrives, your
first job is to work out which point of the sequence it enters at.

---

## 1. Why this harness exists

StoreOps is built by an eight-developer squad at a retail client. The client's
CTO approved AI-assisted development; the engineering standards team blocked
the rollout until a harness existed, because a prior AI-assisted pilot
produced four specific defects that reached the main branch:

| ID | Failure mode observed in the pilot |
| --- | --- |
| **F1** | Direct imports from another module's repository, bypassing the agreed service boundary and event bus |
| **F2** | Raw `Error` throws in service methods, bypassing the project's typed `AppError` hierarchy |
| **F3** | Tests that asserted HTTP status codes but did not verify business rule compliance |
| **F4** | Missing event bus integration — state changes written directly to sibling module repositories |

**Preventing these four from reaching main is the harness's reason to exist.**
Every check, every skill file, and every Evaluator instruction traces back to
one of them. If you are ever unsure whether something matters, ask which
failure mode it belongs to.

---

## 2. Components

| Component | Agent file | Role |
| --- | --- | --- |
| Planner | `.harness/agents/planner.agent.md` | Decomposes a feature request into `spec.md` + sprint contracts with GIVEN/WHEN/THEN acceptance criteria |
| Generator | `.harness/agents/generator.agent.md` | Implements one sprint contract; writes code, tests and `generator-summary.md` |
| Evaluator | `.harness/agents/evaluator.agent.md` | Reviews Generator output; runs the gate; issues PASS / CONDITIONAL PASS / FAIL in `evaluator-feedback.md` |
| Monitor | `.harness/agents/monitor.agent.md` | Records the sprint outcome in `run-log.md` and archives the run to `.harness/reviews/` |

Skill files in `.harness/skills/` are **feedforward context**: they are loaded
*before* an agent acts, not consulted afterwards. Section 6 states exactly
which agent loads which skill.

---

## 3. The developer's two active steps

Everything else is autonomous.

1. Invoke the Planner with a feature prompt, e.g.
   `@planner Add shift handover bulk update to activities`
2. Review `.harness/output/spec.md` and reply `APPROVED` (or give change
   notes, in which case the Planner revises and asks again).

After `APPROVED`, run the Generator/Evaluator loop for every sprint without
asking for further confirmation. Return to the developer only at an
**escalation** (section 5) or when all sprints have passed.

---

## 4. Orchestration sequence

```
developer prompt
      │
      ▼
┌───────────┐   spec.md + sprint-N.contract.md + active-rules.json
│  PLANNER  │──────────────────────────────────────────────┐
└───────────┘                                              │
      │ wait for developer APPROVED                        │
      ▼                                                    │
  for each sprint N in order:                              │
      │                                                    ▼
      │   ┌─────────────┐  code + tests + generator-summary.md
      ├──▶│  GENERATOR  │──────────────────────────────┐
      │   └─────────────┘                             │
      │         ▲                                     ▼
      │         │ evaluator-feedback.md      ┌─────────────┐
      │         └────────────────────────────│  EVALUATOR  │
      │            (FAIL, iteration < 3)     └─────────────┘
      │                                             │
      │                                   verdict   │
      │                                             ▼
      │   ┌───────────┐   run-log.md        PASS / CONDITIONAL PASS / FAIL
      └──▶│  MONITOR  │◀───────────────────────────────────
          └───────────┘
                │
                ▼
     next sprint, or escalate to developer
```

### Handoff files (`.harness/output/`)

| File | Written by | Read by |
| --- | --- | --- |
| `spec.md` | Planner | developer, Generator, Evaluator |
| `sprint-<N>.contract.md` | Planner | Generator, Evaluator |
| `active-rules.json` | Planner | Generator, Evaluator, **the gate** (rule `TQ-7`) |
| `generator-summary.md` | Generator | Evaluator |
| `gate-report.json` | the gate | Evaluator, Monitor |
| `evaluator-feedback.md` | Evaluator | Generator (on FAIL), Monitor |
| `run-log.md` | Monitor | developer, next run's Planner |

These files are the **only** channel between agents. Do not carry context
between agents in conversation that is not written to a handoff file: the
archive in `.harness/reviews/` is the governance audit trail, and anything
not written down is not auditable.

`active-rules.json` deserves a note: it makes the Planner's acceptance
criteria machine-readable, and the gate's `TQ-7` rule fails the sprint if any
rule id in it is never asserted by a test. That closes the loop from intent to
verification without a human comparing two documents by hand.

---

## 5. Routing logic

Apply this after every Evaluator verdict. Do not improvise.

| Verdict | Action |
| --- | --- |
| **PASS** | Run the Monitor. Advance to the next sprint. If it was the last sprint, report completion to the developer with the run-log summary. |
| **CONDITIONAL PASS** | Run the Monitor. Advance to the next sprint, and copy the Evaluator's required follow-ups into the next sprint contract's `Carried-in work` section. A CONDITIONAL PASS may never be issued for a blocking gate finding or an unmet acceptance criterion — only for advisory findings and non-blocking quality debt. |
| **FAIL**, iterations used < 3 | Write `evaluator-feedback.md`, increment the iteration counter, and re-invoke the Generator with that feedback. Do not re-invoke the Planner. Do not ask the developer. |
| **FAIL**, iterations used = 3 | **Escalate.** Run the Monitor with `escalated: true`, then stop and report to the developer: the sprint, the persistent findings, what changed across the three iterations, and your assessment of the root cause (see below). |

### Iteration limit

Three Generator iterations per sprint, counted per sprint and reset when a
sprint passes. The limit exists because a fourth attempt on the same feedback
almost never succeeds: by then the problem is usually the *instruction*, not
the implementation.

### Escalation report

When escalating, state which of these you believe is the cause, with evidence:

- **Ambiguous contract** — the acceptance criteria admit more than one reading.
  Fix: the developer amends the sprint contract.
- **Skill file gap** — the Generator repeated a standards violation that no
  skill file warns about. Fix: amend the skill file, note it in the run-log.
- **Genuine technical blocker** — the contract requires something the current
  architecture cannot support. Fix: an architecture decision by the developer.
- **Contradictory constraints** — two rules cannot both be satisfied. Fix: the
  developer decides which gives way.

Never silently relax a standard to force a PASS. If a standard is wrong, say
so, and escalate to have it changed. A gate weakened in the middle of a sprint
is worse than a sprint that fails honestly.

---

## 6. Context discipline

Each agent loads only the skills it needs. Skills are loaded at the *start* of
the agent's turn, not fetched mid-task, so the agent's first token of output is
already informed by the standards.

| Agent | Skills to load | Approx. context |
| --- | --- | --- |
| Planner | `app-context`, `architecture-principles`, `sprint-decomposition`, `api-integration` | ~4k tokens |
| Generator | `app-context`, `architecture-principles`, `coding-conventions`, `api-integration`, `how-to-test` plus detailed F1-F4 references | ~12k tokens |
| Evaluator | `architecture-principles`, `how-to-review`, `evaluation-criteria` plus detailed F1-F4 references as needed | ~9k tokens |
| Monitor | `app-context` plus handoff files | ~2k tokens |

The Generator carries the largest budget on purpose: it is the only agent that
writes code, and every one of the four failure modes is a *writing* mistake.
The Evaluator does not load `storeops-domain` because the sprint contract
already states the domain rules it must verify; giving it the domain skill as
well encourages it to invent requirements the Planner never agreed.

**Context reset between sprints.** Start each sprint with a fresh Generator
context seeded only by: the sprint contract, the previous sprint's
`generator-summary.md`, and the skills above. Do not carry the previous
sprint's full conversation — it doubles cost per sprint and, worse, lets a
superseded instruction survive past the point where it was corrected.

---

## 7. Non-negotiables

1. **The gate is authoritative.** `npm run gate:full` produces
   `gate-report.json`. Any finding with `"severity": "blocking"` is a FAIL.
   The Evaluator may not overrule it, argue it down, or accept it as a
   CONDITIONAL PASS. Deterministic rules exist so that a non-deterministic
   reviewer cannot bargain with them.
2. **Never edit a check to make a sprint pass.** Changing `.harness/checks/**`
   during a Generator iteration is out of scope for the Generator, full stop.
   If a check is wrong, escalate it as a skill-file/standards defect.
3. **Tests must assert business rules, not status codes.** See `TQ-2`, `TQ-3`,
   `TQ-7`. This is failure mode F3 and it is the one a green test suite hides.
4. **Cross-module writes go through the event bus.** Reads may use another
   module's public read port. There is no third option. This is F1 and F4.
5. **Every thrown error is an `AppError` subclass.** This is F2.
6. **Do not weaken coverage thresholds.** They come from the specification
   (service 80%, routes 70%, shared 60%, overall 70%) and live in
   `vitest.config.ts`.

---

## 8. Commands

```bash
npm run gate            # static standards checks only (~0.2s) — run often
npm run gate:full       # + typecheck + tests + coverage thresholds
npm run gate:selftest   # proves the gate still catches all four failure modes
npm run harness:verify  # selftest + gate:full — the pre-merge command
npm test                # vitest
npm run test:coverage   # vitest with the spec's coverage thresholds enforced
npm run dev             # run StoreOps locally on :3000 with seed data
npm run smoke           # start the API and exercise the demo feature end to end
```

The Generator should run `npm run gate` after each meaningful edit — it is fast
enough to use as a feedback loop rather than a final check.

---

## 9. Project shape (what the agents must respect)

```
src/
  contracts/      published language: event catalogue + identity. Depends on nothing.
  platform/       errors, event bus, http middleware, clock/ids/logger ports.
                  Must not import any module.
  modules/        activities, programmes, staff, alerts, reports
    <module>/
      index.ts                  PUBLIC CONTRACT — the only file siblings may import
      <module>.routes.ts        HTTP + validation
      <module>.service.ts       business logic
      <module>.repository.ts    persistence (MODULE-PRIVATE)
      <module>.types.ts         entities and enums
      <module>.subscribers.ts   event handlers owned by this module
  app.ts          composition root — the ONLY file that wires modules together
```

Cross-module rules start in
`.harness/skills/architecture-principles/SKILL.md`; worked examples and the
full gate mapping are in `.harness/skills/module-boundaries.skill.md`.
The short version: **read through `index.ts`, write through the event bus.**
