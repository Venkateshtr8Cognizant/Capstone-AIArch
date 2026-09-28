# Skill — error handling

**Prevents failure mode F2:** raw `Error` throws in service methods, bypassing
the project's typed `AppError` hierarchy.

**Enforced by:** `.harness/checks/check-errors.mjs` — rules `EH-1`…`EH-7`.

---

## The hierarchy

Defined in `src/platform/errors/app-error.ts`. Every error that leaves a
service or route **must** be one of these.

| Class | Status | `code` | Use when |
| --- | --- | --- | --- |
| `ValidationError` | 400 | `VALIDATION_FAILED` | Payload failed schema or format validation. |
| `AuthenticationError` | 401 | `NOT_AUTHENTICATED` | No bearer token, or the token is invalid/expired. |
| `AuthorizationError` | 403 | `NOT_AUTHORIZED` | Valid identity, but not permitted to do this. |
| `NotFoundError` | 404 | `<RESOURCE>_NOT_FOUND` | A referenced entity does not exist — or exists in another store (see below). |
| `ConflictError` | 409 | `STATE_CONFLICT` | The request conflicts with current state: an illegal status transition, a duplicate. |
| `BusinessRuleError` | 422 | `BUSINESS_RULE_VIOLATION` | A documented business rule rejected a well-formed, permitted request. **Carries `rule`.** |
| `InternalError` | 500 | `INTERNAL_ERROR` | Unexpected failure. `isOperational === false` — this is what alerting pages on. |

Every subclass carries `code`, `statusCode`, `isOperational`, `details[]` and
`correlationId`. The error middleware in
`src/platform/http/middleware.ts` is the single place an error becomes a
response — which only works because the whole codebase throws these types.

## Choosing between 400, 403, 404, 409 and 422

This distinction is worth getting right; `EH-1` only proves you threw *an*
`AppError`, and the Evaluator checks whether you threw the *right* one.

- **400** — the request is malformed. `taskIds` is not an array.
- **403** — the request is well-formed and the caller is known, but the caller
  may not do this. An associate trying to delete someone else's activity.
- **404** — the entity does not exist *as far as this caller is concerned*.
  StoreOps deliberately returns 404, not 403, for an entity in another store,
  so the API does not leak the existence of other stores' data:

  ```ts
  const task = await this.deps.repository.find(taskId);
  if (!task || task.storeId !== principal.storeId) {
    throw new NotFoundError('Activity', taskId);   // ✅ not AuthorizationError
  }
  ```

- **409** — the entity exists and the caller may act, but its current state
  forbids it. `DONE → IN_PROGRESS` is an illegal transition.
- **422** — everything is in order and a *named business rule* says no. This is
  the only class that carries a rule id, and that is what makes rule-level
  testing possible.

## `BusinessRuleError` — the rule id is mandatory

```ts
// ✅
throw new BusinessRuleError('BR-3', 'A note explaining the blocker is required when setting BLOCKED', {
  details: [{ path: 'note', message: 'required when status is BLOCKED', rule: 'BR-3' }],
  correlationId,
});
```

The first argument must be the rule id from the sprint contract (`EH-5`). It
reaches the client as `error.rule`, and the test asserts on it:

```ts
expect(response.status).toBe(422);
expect(response.body.error.rule).toBe('BR-3');     // ← this is what satisfies F3
```

Put a `rule` on each `details[]` entry too. For a bulk operation that can
violate several rules at once, the client then gets every violation with its
rule id in one response and can fix the whole batch in one round trip.

---

## The exact defect this prevents

```ts
// ❌ src/modules/activities/activities.service.ts
async bulkUpdateStatus(taskIds: string[], targetStatus: string) {
  if (taskIds.length === 0) {
    throw new Error('taskIds must not be empty');          // ❌ EH-1
  }
  if (taskIds.length > 50) {
    throw new RangeError('too many ids');                  // ❌ EH-1
  }
  if (targetStatus !== 'DONE' && targetStatus !== 'BLOCKED') {
    throw 'targetStatus must be DONE or BLOCKED';          // ❌ EH-2
  }
  try {
    await this.persist(taskIds);
  } catch {
    // ❌ EH-3 — the failure disappears
  }
}
```

What the client sees for all three throws: **HTTP 500, `INTERNAL_ERROR`.**

Consequences:

1. **A client error becomes a server error.** The caller cannot tell "you sent
   an empty array" from "our database is down", so it cannot decide whether
   retrying is sensible.
2. **On-call gets paged for user input.** `InternalError` is the only
   non-operational error; the middleware logs it at `error` and alerting
   escalates. Raw `Error` lands in the same bucket.
3. **No `rule`, so no rule-level test.** The test can only assert `500`, which
   is exactly failure mode F3 — F2 and F3 are the same defect seen from two
   ends.
4. **The empty catch loses the failure entirely.** The endpoint returns 200
   and nothing happened.

---

## Rules in brief

| Rule | Requirement |
| --- | --- |
| `EH-1` | Every `throw new X()` in `src/**` throws an `AppError` subclass. Subclasses are discovered from source, so a new one needs no check change. |
| `EH-2` | Never throw a non-Error value. |
| `EH-3` | No empty `catch {}`. Log with the correlation id and rethrow, or convert to an `AppError` that states what happened. |
| `EH-4` | Route files must not call `res.status(4xx\|5xx)`. Throw; the middleware owns the wire format. |
| `EH-5` | `BusinessRuleError`'s first argument is a rule id. |
| `EH-6` | *(advisory)* No `console.*` — inject the `Logger` port. |
| `EH-7` | *(advisory)* A `catch` that returns `null`/`[]`/`{}` hides the failure from the caller. |

## Catching and rethrowing

A subscriber must not fail its publisher, so it logs and rethrows, letting the
bus dead-letter the event:

```ts
try {
  await deps.service.adjust(/* … */);
} catch (error) {
  deps.logger.error('inventory.restock_failed', {
    code: isAppError(error) ? error.code : 'UNKNOWN',
    message: error instanceof Error ? error.message : String(error),
    correlationId: event.correlationId,
  });
  throw error;                       // the bus dead-letters it
}
```

Wrapping an unexpected lower-level failure:

```ts
} catch (error) {
  throw new InternalError('Failed to persist the handover batch', {
    cause: error,                    // ✅ keep the original
    correlationId,
  });
}
```

## Self-check before you hand off

- Every throw site uses an `AppError` subclass, and the *right* one.
- Every `BusinessRuleError` carries its contract rule id.
- No route file builds a 4xx/5xx response by hand.
- No empty catch; every caught error is logged with its correlation id.
- `npm run gate` reports no `EH-*` blocking findings.
