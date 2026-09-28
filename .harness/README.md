# `.harness/` — the StoreOps development harness

`.harness/` rather than `.github/` on purpose: harness files are project
governance, not CI configuration, and mixing them makes it unclear which
rules a pipeline enforces and which an agent does. CI *calls* the harness
(`npm run harness:verify`); it does not contain it.

```
.harness/
├── agents/       four agent definitions — role, skills to load, files written
├── skills/       canonical <skill>/SKILL.md guides plus detailed references
├── checks/       the deterministic gate + its own self-test and fixtures
├── templates/    the handoff document shapes
├── output/       live handoff files for the current run
└── reviews/      archived runs — the governance audit trail
```

## The four components

| Component | File | Runs when |
| --- | --- | --- |
| Planner | `agents/planner.agent.md` | A developer asks for a feature |
| Generator | `agents/generator.agent.md` | Per sprint, up to 3 iterations |
| Evaluator | `agents/evaluator.agent.md` | After every Generator run |
| Monitor | `agents/monitor.agent.md` | After every Evaluator verdict |

`CLAUDE.md` in the repository root is the orchestrator: it holds the sequence
and the routing rules (PASS → next sprint, FAIL → back to the Generator,
3 iterations → escalate). Start there.

## The gate

```bash
npm run gate            # 4 static checks, ~0.2s — run it constantly
npm run gate:full       # + typecheck + tests + coverage thresholds, ~33s
npm run gate:selftest   # proves the gate still catches all four failure modes
npm run harness:verify  # selftest + gate:full — the pre-merge command
```

Every rule maps to one of the four failure modes from the client's prior AI
pilot:

| Check | Failure mode | Rules |
| --- | --- | --- |
| `check-boundaries.mjs` | **F1** sibling repository imports | `MB-1`…`MB-7` |
| `check-errors.mjs` | **F2** raw `Error` throws | `EH-1`…`EH-7` |
| `check-test-quality.mjs` | **F3** status-code-only tests | `TQ-1`…`TQ-7` |
| `check-events.mjs` | **F4** missing event integration | `EV-1`…`EV-7` |

Findings are `blocking` or `advisory`. A single blocking finding is a FAIL and
the Evaluator may not overrule it. The checks are dependency-free Node scripts:
no npm install, no build step, no config, so they run identically on a laptop,
in CI, and inside the Docker build.

### Why there is a self-test

A gate that has never been observed to fail is indistinguishable from a gate
that does nothing. `checks/fixtures/` holds five miniature StoreOps trees —
one clean control and one per failure mode — and `selftest.mjs` asserts that
each expected rule fires and that the control produces nothing. It runs in CI,
so refactoring a check cannot silently disable it.

## Skills

Loaded *before* an agent acts, not consulted afterwards. Which agent loads
which is set out in `CLAUDE.md` §6.

| Skill | Prevents | Loaded by |
| --- | --- | --- |
| `app-context/SKILL.md` | shared StoreOps context | Planner, Generator, Monitor |
| `architecture-principles/SKILL.md` | shared ownership and layering | Planner, Generator, Evaluator |
| `sprint-decomposition/SKILL.md` | contract quality | Planner |
| `coding-conventions/SKILL.md` | TypeScript and typed errors | Generator |
| `api-integration/SKILL.md` | HTTP and event integration | Planner, Generator |
| `how-to-test/SKILL.md` | business-rule verification | Generator |
| `how-to-review/SKILL.md` | independent review procedure | Evaluator |
| `evaluation-criteria/SKILL.md` | weights, hard gates, verdicts | Evaluator |

The flat `*.skill.md` files are retained as detailed StoreOps worked examples
and rule-to-check references for F1-F4.

Each one states the rule, shows the **actual defect** it prevents as code,
shows the correct version, and ends with a self-check list. The worked defect
matters more than the rule statement: an agent that has seen the wrong version
recognises it in its own output.

## Reviews

`reviews/<date>-<feature>/` is the audit trail. The run in
`reviews/2026-09-22-shift-handover-bulk-status/` is the demonstration: two
sprints, three Generator invocations, one FAIL→PASS recovery, and the rejected
code preserved alongside the real gate report that rejected it. Its `README.md`
documents which artefacts are captured tool output and which are agent-written
records.
