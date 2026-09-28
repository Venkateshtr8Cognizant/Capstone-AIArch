# Skill — API conventions

Loaded by the **Planner** (so acceptance criteria state real HTTP outcomes)
and the **Generator** (so the surface stays consistent). Partly enforced by
`EH-4` and `MB-7`; the rest is convention the Evaluator checks by reading.

---

## Envelope

Every response body has exactly one top-level key.

```jsonc
// success
{ "data": { /* resource */ } }
{ "data": [ /* collection */ ] }

// failure — produced only by the error middleware
{
  "error": {
    "code": "BUSINESS_RULE_VIOLATION",
    "message": "Bulk status update rejected: 1 request-level violation(s)",
    "details": [
      { "path": "note", "message": "required when status is BLOCKED", "rule": "BR-3" }
    ],
    "correlationId": "corr_api_1",
    "rule": "BR-3"
  }
}
```

`rule` appears only on `BusinessRuleError`. `details[]` is always present, and
may be empty. Never return a bare array or a bare string.

## Status codes

| Code | When |
| --- | --- |
| 200 | Successful read or update |
| 201 | Resource created (`POST /api/activities`, `POST /api/programmes`, adding a member) |
| 204 | Successful delete, no body |
| 400 | Schema or format validation failure (`VALIDATION_FAILED`) |
| 401 | Missing, malformed or expired bearer token (`NOT_AUTHENTICATED`) |
| 403 | Authenticated but not permitted (`NOT_AUTHORIZED`) |
| 404 | Entity does not exist, **or belongs to another store** |
| 409 | Illegal state transition or duplicate (`STATE_CONFLICT`) |
| 422 | Named business rule rejection (`BUSINESS_RULE_VIOLATION`, with `rule`) |
| 500 | Unexpected failure (`INTERNAL_ERROR`) — never used for caller mistakes |

### Partial success

An operation that supports partial failure returns **200** with both outcomes
in the body, and a **422** only when nothing succeeded (`BR-9`), so the caller
can always distinguish "some of it worked" from "none of it worked":

```jsonc
{
  "data": {
    "bulkOperationId": "bulk_0001",
    "targetStatus": "DONE",
    "updatedCount": 1,
    "failedCount": 2,
    "updated": [ { "taskId": "task_0001", "status": "DONE" } ],
    "failed": [
      { "taskId": "task_0002", "code": "NOT_PERMITTED",      "rule": "BR-7", "message": "…" },
      { "taskId": "task_ghost", "code": "ACTIVITY_NOT_FOUND", "rule": "BR-4", "message": "…" }
    ]
  }
}
```

Per-item failures carry a stable `code` **and** the `rule` that rejected them.
A `failed[]` entry with only a prose message forces the client to parse English.

## URLs

- Base path `/api`. Plural, lower-case, hyphenated collections:
  `/api/activities`, `/api/programmes`.
- Sub-resources nest one level: `/api/programmes/:id/members`.
- A collection-wide operation is a literal path segment, registered **before**
  the parameterised route so it is not swallowed by it:

  ```ts
  router.patch('/activities/bulk-status', /* … */);   // must come first
  router.patch('/activities/:id', /* … */);
  ```

- No verbs in paths, with one deliberate exception: a state transition that is
  not a resource update takes a sub-path — `POST /api/programmes/:id/close`.
- Filters are query parameters, validated with zod like any other input.

## Validation

zod at the edge, in the route file, with the schema next to the handler. The
service re-checks the same invariant, because a service must hold its rules for
non-HTTP callers too (scheduled jobs, a future surface):

```ts
const bulkStatusSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1).max(MAX_BULK_BATCH_SIZE),  // BR-1
  targetStatus: z.enum(BULK_TARGET_STATUSES),                          // BR-2
  note: z.string().max(500).nullable().optional(),
});
```

Derive schema bounds from the domain constant, never a literal: `MAX_BULK_BATCH_SIZE`
is in `activities.types.ts` and the rule, the schema and the message all move
together when it changes.

Schema failures are 400. Business rule failures are 422. `BR-1` appears in both
because the schema is a fast edge check and the service is the real guarantee.

## Identity and scoping

- Read the caller from `principalOf(req)`. Never trust a body field for
  identity, role or store.
- Scope every query by `principal.storeId`.
- Path parameters go through `pathParam(req, 'id')`, which raises a typed
  `ValidationError` rather than being cast.

## Correlation ids

`correlationId()` middleware assigns `x-correlation-id` (honouring an incoming
one) and echoes it on the response. Thread it through the service call, into
every event envelope, and into every log line. Every error body carries it.

That single value is what lets an on-call engineer follow one shift-handover
request from the HTTP log, through the bulk update, into the alert the store
manager received and the report recompute it triggered.

## Audit trail

Any state change appends a `TaskAuditEntry`: `at`, `actorId`, `action`,
`fromStatus`, `toStatus`, `note`. Audit entries are append-only — never
rewritten, never removed. `TaskView` exposes `auditEntryCount` rather than the
entries themselves, so the trail cannot be reshaped by a client.

## Versioning

The surface is unversioned at `/api` while StoreOps has a single first-party
consumer. A breaking change needs either a new field with a default, or a
versioned path introduced alongside the old one with a deprecation window.
Event payloads follow the same rule — see `event-integration.skill.md`.
