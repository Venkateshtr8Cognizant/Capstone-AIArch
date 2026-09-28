# Submission deliverables

| Required component | Evidence | Status |
| --- | --- | --- |
| Working harness - orchestrator | `CLAUDE.md` | Complete |
| Four bounded agents | `.harness/agents/` | Complete |
| Minimum six project-specific skills | `.harness/skills/*/SKILL.md` plus detailed legacy references | Complete |
| Deterministic evaluation framework | `.harness/checks/`, `vitest.config.ts` | Complete; self-test 5/5 |
| Harness Design Brief (3-5 page equivalent) | `DESIGN_BRIEF.md` | Complete |
| Demonstration prompt | `PROMPT.md` | Complete |
| Planner specification and contracts | `.harness/reviews/2026-09-22-shift-handover-bulk-status/` | Complete |
| Generator summaries and Evaluator feedback | iteration directories in the same archive | Complete |
| Monitor run log | archived `run-log.md` | Complete |
| Final generated code and tests | `src/`, `tests/` | Complete; 101 tests |
| Deployment instructions and evidence | `DEPLOYMENT.md`, archived `smoke-run.txt` | Partial: Docker screenshot outstanding |
| Reflection (maximum one page) | `REFLECTION.md` | Complete |
| Optional architecture journal | `JOURNAL.md` | Complete |

## Final verification

Run:

```bash
npm install
npm run harness:verify
npm run smoke
```

Latest verified result (2026-09-28): gate PASS with zero blocking findings,
101 tests PASS, 93.22% line coverage, and smoke PASS 33/33.

## One remaining submission action

Run `docker compose up --build -d` on a Docker-enabled workstation and capture
one screenshot showing both the healthy container and a successful
`PATCH /api/activities/bulk-status` response. See `DEPLOYMENT.md`.
