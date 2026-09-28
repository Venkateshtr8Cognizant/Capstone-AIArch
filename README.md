# StoreOps API + agentic development harness

Capstone submission — **AI Native Tech Architect programme**, Harness
Engineering track.

Two things live in this repository:

1. **StoreOps** — a retail store operations management REST API (five domain
   modules, event-driven, typed error hierarchy). The reference codebase.
2. **The harness** in `.harness/` — a governed orchestration layer that turns
   a one-line feature request into reviewed, standards-compliant code, and
   refuses to accept code that breaks the project's architecture.

> StoreOps is a capstone reference codebase. Do not use it in production.

---

## Start here

| If you want to… | Read |
| --- | --- |
| Read the submission Design Brief | [`DESIGN_BRIEF.md`](DESIGN_BRIEF.md) |
| Understand the extended design narrative | [`docs/harness-design-brief.md`](docs/harness-design-brief.md) |
| Check every submission deliverable | [`DELIVERABLES.md`](DELIVERABLES.md) |
| See how the agents are orchestrated | [`CLAUDE.md`](CLAUDE.md) |
| See the harness catch real defects | [`.harness/reviews/2026-09-22-shift-handover-bulk-status/`](.harness/reviews/2026-09-22-shift-handover-bulk-status/) |
| Read the standards the agents are held to | [`.harness/skills/`](.harness/skills/) |
| Understand the codebase layout | [§ Architecture](#architecture) below |

## Verify the whole thing in three commands

```bash
npm install
npm run harness:verify
npm run smoke
```

- `harness:verify` runs the gate's self-test (proving the gate still catches
  all four failure modes) then the full gate: four static standards checks,
  typecheck, 101 tests, and the coverage thresholds.
- `smoke` builds the project, starts a real server, and drives the
  demonstration feature over HTTP — including the partial-failure path, the
  typed 422s, and the cross-module effects that travel by event bus.

Last verified on this machine (Node 22.17.1, Windows 11):

| Command | Result |
| --- | --- |
| `npm run gate:selftest` | PASS — 5/5 fixtures, F1–F4 all provably caught |
| `npm run gate` | PASS — 0 blocking, 4 advisory, 0.2s |
| `npm run typecheck` | PASS |
| `npm test` | **101 passed** (72 unit, 29 integration) |
| `npm run test:coverage` | 93.22% lines; services 87.6–100%; routes 100% |
| `npm run smoke` | **PASS — 33/33 checks** against a running server |

## The problem this solves

The client's engineering standards team blocked their Claude Code rollout
because a prior AI-assisted pilot put four specific defects on main:

| | Failure mode | Caught by |
| --- | --- | --- |
| **F1** | Direct imports from another module's repository, bypassing the service boundary and event bus | `check-boundaries.mjs` |
| **F2** | Raw `Error` throws in service methods, bypassing the typed `AppError` hierarchy | `check-errors.mjs` |
| **F3** | Tests that assert HTTP status codes without verifying business rule compliance | `check-test-quality.mjs` |
| **F4** | Missing event bus integration — state changes written directly to sibling module repositories | `check-events.mjs` |

**All four occurred during the demonstration run. None reached main.** The
first attempt at sprint 2 produced 23 blocking findings while passing its own
tests and typecheck — the rejected code is preserved in the archive with the
gate report that rejected it, so you can reproduce the FAIL:

```bash
node .harness/checks/gate.mjs \
  --root=.harness/reviews/2026-09-22-shift-handover-bulk-status/sprint-2-iteration-1/rejected-code \
  --out=../gate-report.json
```

## How a feature gets built

The developer has exactly two active steps. Everything between them is
autonomous.

```
developer:  @planner Add shift handover bulk update to activities
            ↓
Planner  →  spec.md + sprint contracts + active-rules.json
            ↓
developer:  APPROVED
            ↓
         ┌──────────────────────────────────────┐
         │ per sprint:                          │
         │   Generator → code + tests + summary │
         │   Evaluator → gate + verdict         │
         │   PASS → next sprint                 │
         │   FAIL → back to Generator (max 3)   │
         │   3 FAILs → escalate to developer    │
         │   Monitor → run-log, every verdict   │
         └──────────────────────────────────────┘
```

## Architecture

```
src/
  contracts/      published language — event catalogue + identity. Depends on nothing.
  platform/       errors, event bus, http middleware, clock/ids/logger ports.
  modules/
    activities/   operational activities — Task, status/priority/category
    programmes/   store programmes and membership
    staff/        authentication and staff lookups (auth-only, no CRUD surface)
    alerts/       notifications, raised by subscribing to activities events
    reports/      store/regional aggregation (read-only w.r.t. other modules)
  app.ts          composition root — the only file that wires modules together
```

Each module has the same shape:

```
<module>/
  index.ts                  PUBLIC CONTRACT — the only file siblings may import
  <module>.routes.ts        HTTP + zod validation
  <module>.service.ts       business logic
  <module>.repository.ts    persistence (module-private)
  <module>.types.ts         entities and enums
  <module>.subscribers.ts   event handlers owned by this module
```

**Two cross-module rules, and no third option:**

1. **Reads** go through the other module's public read port
   (`StaffReadPort`, `ActivityReadPort`) — injected, imported as a type from
   `index.ts`.
2. **Writes** go through the event bus. A module never writes a sibling's
   state; it publishes, and the owning module reacts in its own subscriber.

## API surface

All `/api` routes need `Authorization: Bearer <token>`. `staff` is the
auth-only module: tokens come from the client's identity provider and StoreOps
stores no credentials.

| Method + path | Notes |
| --- | --- |
| `GET /health` | unauthenticated |
| `GET /api/activities` | `?programmeId=` `?status=` filters |
| `POST /api/activities` | |
| `GET /api/activities/:id` | 404 for another store's activity, not 403 |
| `PATCH /api/activities/:id` | status, priority, category, assignee |
| `DELETE /api/activities/:id` | creator or store manager only |
| `PATCH /api/activities/bulk-status` | **the harness demonstration feature** |
| `GET /api/programmes` | authenticated store only |
| `POST /api/programmes` | |
| `POST /api/programmes/:id/members` | |
| `POST /api/programmes/:id/close` | triggers the `STORE_SUMMARY` recompute |
| `GET /api/alerts` | authenticated user only |

Nine base endpoints per specification 3.6, plus two documented extensions
(`bulk-status`, `programmes/:id/close`). `reports` has no endpoint yet — the
regional rollup is backlog item F-3.

### Try the demonstration feature

```bash
npm run dev
```

```bash
curl -s -X PATCH http://localhost:3000/api/activities/bulk-status \
  -H "authorization: Bearer token-alice-associate" \
  -H "content-type: application/json" \
  -H "x-correlation-id: demo-1" \
  -d '{"taskIds":["task_1","task_2","task_nope"],"targetStatus":"DONE"}'
```

Returns 200 with `updated[]` and `failed[]` — each failure carrying a stable
`code` and the `rule` that rejected it. Seeded tokens are in
[`src/seed.ts`](src/seed.ts).

## Deployment

```bash
docker compose up --build
curl http://localhost:3000/health
```

The Docker build runs `npm run harness:verify` in the build stage, so an image
cannot be produced from code that violates the project standards.

> **Not verified on this machine.** Docker is not installed on the workstation
> this submission was built on, so `Dockerfile` and `docker-compose.yml` are
> reviewed but unexecuted. The equivalent running-application evidence is
> `npm run smoke` (33/33 against a real server, output archived at
> `.harness/reviews/2026-09-22-shift-handover-bulk-status/smoke-run.txt`).
> Run the two commands above to complete the container evidence, including the
> screenshot the programme brief asks for.

## Stack and deviations from the bootstrap prompt

| Choice | Bootstrap prompt | This repository | Why |
| --- | --- | --- | --- |
| Runtime | Node.js 20 LTS | Node 20+ (`engines`), developed on 22.17 | Compatible; `Dockerfile` pins `node:20-alpine` |
| Language | not specified | TypeScript 5.7, strict, `noUncheckedIndexedAccess` | The typed `AppError` hierarchy and read-only ports are what make F1/F2 enforceable by the compiler as well as the gate |
| Tests | `Jest + supertest` | **Vitest + supertest** | Native ESM/TS with no transform config, and first-class per-glob coverage thresholds, which is how specification 3.6's 80/70/60/70 floors are actually enforced. supertest is unchanged. A documented deviation, not an oversight. |
| Storage | in-memory | in-memory behind repository ports | Per the prompt. Swapping in a database is a repository change only |
| Linting | "configured and passing" | `tsc --strict` + four bespoke standards checks | Generic lint rules do not encode F1–F4. The gate does, and it is self-tested |

## Known gaps

Recorded rather than hidden — the harness's value is partly in making these
visible:

1. **F-5 — escalation gap.** A `HIGH`/`CRITICAL` activity blocked *in a
   handover* raises no `ESCALATION`, because `alerts.blocked-escalation`
   subscribes to `activities.task.status_changed` and the bulk path emits
   `activities.bulk_status.completed`. Found by the smoke run, not the gate;
   the analysis of why no check could catch it is in
   [`storeops-domain.skill.md`](.harness/skills/storeops-domain.skill.md).
2. **Container evidence outstanding** — see Deployment above.
3. **Four `EV-6` advisories** — published events with no in-process consumer.
   All legitimate downstream channels today; the Monitor tracks the count
   because a rising count is failure mode F4 arriving slowly.
4. **Sprint 1 has no archived `gate-report.json`.** Its gate run predates the
   current code, and a report reconstructed afterwards is not evidence. The
   fix (archive per iteration at run time) is recommendation R-2 in the
   run-log.
