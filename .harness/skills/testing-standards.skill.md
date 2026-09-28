# Skill — testing standards

**Prevents failure mode F3:** tests that assert HTTP status codes but do not
verify business rule compliance.

**Enforced by:** `.harness/checks/check-test-quality.mjs` — rules `TQ-1`…`TQ-7`,
plus the coverage thresholds in `vitest.config.ts`.

---

## Why this is the hardest of the four

F1, F2 and F4 leave a visible trace: a bad import, a raw throw, a missing
publish. F3 leaves none. A status-code-only test suite is **green, fast, and
gives full line coverage of the handler it tests** — because calling the
endpoint executes every line. Coverage tooling cannot detect it. It looks like
exactly what you want, right up to the point where a rule is quietly broken
and every test still passes.

So the standard is not "write tests" or "hit a coverage number". It is:

> **A test must fail if the business rule it covers is removed.**

Before you commit a test, do this thought experiment: delete the rule check
from the service. Which test goes red? If the answer is "none", the test is
theatre, regardless of what the coverage report says.

---

## The rules

| Rule | Requirement |
| --- | --- |
| `TQ-1` | Every test case asserts something. |
| `TQ-2` | A test that asserts an HTTP status code must also assert a business outcome: a response body field, an emitted event, a typed error code, or persisted state. |
| `TQ-3` | A test that asserts a **422** must assert *which rule* was violated (`error.rule`, or `details[].rule`). |
| `TQ-4` | Every test file has at least one rejection case. A suite of happy paths cannot show a rule is enforced. |
| `TQ-5` | No `.skip`, `.todo` or `.only`. |
| `TQ-6` | *(advisory)* No `new Date()`, `Date.now()`, `Math.random()`, `randomUUID()` in tests — use `FixedClock` and `SequentialIdGenerator` via `buildFixture()`. |
| `TQ-7` | Every rule id in `.harness/output/active-rules.json` appears in at least one test assertion. |

`TQ-2` and `TQ-3` apply only to cases that actually issue a request
(`request(app)` / `.expect(`). A unit test asserting `error.statusCode === 422`
on a typed error *is* asserting the error contract, and is not penalised.

### Coverage thresholds (specification 3.6, enforced)

| Scope | Minimum line coverage |
| --- | --- |
| Service layer (`src/modules/**/*.service.ts`) | 80% |
| Route layer (`src/modules/**/*.routes.ts`) | 70% |
| Shared utilities (`src/platform/**`) | 60% |
| Overall project | 70% |

These are in `vitest.config.ts` and the gate runs them. Coverage is a floor,
never evidence of quality: a file can be at 100% and prove nothing. Never
lower a threshold to make a sprint pass.

---

## The exact defect this prevents

```ts
// ❌ tests/integration/bulk-status.api.test.ts
it('works', async () => {
  const response = await request(app)
    .patch('/api/activities/bulk-status')
    .send({ taskIds: ['task_1', 'task_2'], targetStatus: 'DONE' });
  expect(response.status).toBe(200);                          // ❌ TQ-2
});

it('handles bad input', async () => {
  const response = await request(app)
    .patch('/api/activities/bulk-status')
    .send({ taskIds: [], targetStatus: 'DONE' });
  expect(response.status).toBe(422);                          // ❌ TQ-2, TQ-3
});
```

What this passes while proving nothing:

- The endpoint could have updated **zero** activities and still returned 200.
- It could have updated activities belonging to **another store** (BR-5).
- It could have set them to the **wrong status**.
- It could have skipped the **audit entry** (BR-8) entirely.
- It could have failed to publish `activities.bulk_status.completed` (BR-10),
  so no handover alert and no report recompute — and the second test would
  still pass, because *something* returned 422 for *some* reason.

### The correct version

```ts
// ✅
it('returns 200, updates the batch, and emits one bulk event', async () => {
  const first = await seedActivity(fixture);
  const second = await seedActivity(fixture, { title: 'Clear the back-stock cage' });

  const response = await request(fixture.app)
    .patch('/api/activities/bulk-status')
    .set(...auth('groceryLead'))
    .set('x-correlation-id', 'corr_api_1')
    .send({ taskIds: [first, second], targetStatus: 'DONE' });

  expect(response.status).toBe(200);
  expect(response.body.data.updatedCount).toBe(2);                    // it did the work
  expect(response.body.data.updated.map((i) => i.status)).toEqual(['DONE', 'DONE']);

  const events = fixture.events('activities.bulk_status.completed');  // BR-10
  expect(events).toHaveLength(1);
  expect(events[0]?.payload.updated).toHaveLength(2);
  expect(events[0]?.correlationId).toBe('corr_api_1');

  const listed = await request(fixture.app)
    .get('/api/activities?status=DONE')
    .set(...auth('groceryLead'));
  expect(listed.body.data).toHaveLength(2);                           // it persisted
});

// ✅ a rejection case that names the rule
it('returns 422 when BLOCKED is requested without a note (BR-3)', async () => {
  const taskId = await seedActivity(fixture);

  const response = await request(fixture.app)
    .patch('/api/activities/bulk-status')
    .set(...auth('groceryLead'))
    .send({ taskIds: [taskId], targetStatus: 'BLOCKED' });

  expect(response.status).toBe(422);
  expect(response.body.error.rule).toBe('BR-3');                      // TQ-3
  expect(response.body.error.details[0]).toMatchObject({ path: 'note', rule: 'BR-3' });

  const untouched = await request(fixture.app)
    .get(`/api/activities/${taskId}`)
    .set(...auth('groceryLead'));
  expect(untouched.body.data.status).toBe('TODO');                    // nothing changed
});
```

---

## How to structure tests

### Unit tests — `tests/unit/`

Rules first. A pure rule function (`bulk-status.rules.ts`) lets you cover every
rule and every boundary in milliseconds, with no server. Table-driven tests
are ideal for transition matrices:

```ts
it.each<[TaskStatus, 'DONE' | 'BLOCKED', boolean]>([
  ['TODO', 'DONE', true],
  ['DONE', 'DONE', false],
  ['BLOCKED', 'BLOCKED', false],
])('transition %s -> %s is allowed: %s (BR-6)', (from, target, allowed) => {
  /* … */
});
```

Unit tests may import module internals — that is what makes them worth having.

### Integration tests — `tests/integration/`

Drive HTTP with supertest. **No** imports of `*.service.ts` or
`*.repository.ts` (`MB-5`): an API test that reaches past the router stops
testing the thing the client calls.

Assert cross-module effects through the **public** surface — call
`GET /api/alerts`, or the module's read port — never by reading a sibling's
repository.

### Naming

Put the rule id in the test name: `'returns 422 when BLOCKED is requested
without a note (BR-3)'`. When it fails in CI six months from now, the name
tells the reader which business rule regressed, not just which line broke.

## The fixture

`tests/support/storeops-fixture.ts` gives you a deterministic app: `FixedClock`
at `2026-09-22T13:00:00Z`, `SequentialIdGenerator` (`task_0001`, `bulk_0001`),
a `RecordingLogger`, a seeded single-store roster, and:

- `fixture.events('activities.bulk_status.completed')` — everything published;
- `fixture.subscribersOf(type)` — who is listening;
- `fixture.principal('groceryLead')` — a typed principal;
- `auth('groceryLead')` — the bearer header;
- `seedActivity(fixture, overrides)` — an activity, via the service layer.

Use it rather than building your own app: shared fixtures are how the whole
suite stays deterministic.

## Self-check before you hand off

- Every rule id in `active-rules.json` has a test that provokes it.
- Every 422 test asserts `error.rule`.
- Every status assertion sits beside a business assertion.
- At least one rejection case per file.
- For each rule: if I deleted the check, a named test would go red.
- `npm run gate` reports no `TQ-*` findings; `npm run test:coverage` passes.
