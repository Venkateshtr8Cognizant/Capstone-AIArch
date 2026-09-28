# Skill — module boundaries

**Prevents failure mode F1:** direct imports from another module's repository,
bypassing the agreed service boundary and event bus.

**Enforced by:** `.harness/checks/check-boundaries.mjs` — rules `MB-1`…`MB-7`.

---

## The two permitted forms of cross-module coupling

StoreOps is a modular monolith with five domain modules: `activities`,
`programmes`, `staff`, `alerts`, `reports`. There are exactly two legal ways
for one module to interact with another.

### 1. Read-only lookups through the public contract

A module may read another module's data by calling that module's **read port**,
which it receives by injection and imports as a *type* from the sibling's
`index.ts`:

```ts
// src/modules/activities/activities.service.ts
import type { StaffReadPort } from '../staff/index.js';   // ✅ public contract

export class ActivityService {
  constructor(private readonly deps: { staff: StaffReadPort /* … */ }) {}

  async create(/* … */) {
    const assignee = await this.deps.staff.findUser(input.assigneeId);  // ✅ read
  }
}
```

Read ports are deliberately read-only interfaces. `StaffReadPort` has
`findUser`, `findDepartmentLead`, `listStoreManagers` — and no mutators. The
type system does most of this work; the gate catches the rest.

### 2. Side effects through the event bus

A module may cause a change in another module's state **only** by publishing an
event the other module subscribes to. See `event-integration.skill.md`.

**There is no third option.** No direct writes, no calling a sibling's service
to mutate, no importing a sibling's repository.

---

## What the rules actually say

| Rule | Requirement |
| --- | --- |
| `MB-1` | A cross-module import must target `src/modules/<other>/index.ts` and nothing else. Every other file in a module is private to it. |
| `MB-2` | `src/platform/**` must not import `src/modules/**`. The platform layer is module-agnostic, which is what makes it replaceable. |
| `MB-3` | `src/contracts/**` must import nothing outside `src/contracts/**`. The published language cannot depend on an implementation. |
| `MB-4` | A module file must not import its own module's `index.ts` — that is a cycle through the public contract. Import the sibling file directly. |
| `MB-5` | `tests/integration/**` must not import `*.service.ts` or `*.repository.ts`. API tests drive the public surface. (`tests/unit/**` may import internals — that is the point of a unit test.) |
| `MB-6` | No file outside a module may name that module's repository symbol, even in a type position. |
| `MB-7` | Route files must not import a sibling module at all, and no single module file may depend on three or more sibling modules — that is orchestration, and it belongs in `src/app.ts`. |

---

## The exact defect this prevents

This is what the client's prior AI-assisted pilot produced. It compiles. The
tests pass. It shipped.

```ts
// ❌ src/modules/activities/activities.service.ts
import { InMemoryAlertRepository } from '../alerts/alerts.repository.js';

export class ActivityService {
  private readonly alerts = new InMemoryAlertRepository();

  async bulkUpdateStatus(taskIds: string[], storeId: string) {
    // ... update activities ...
    await this.alerts.save({                     // ❌ MB-1, MB-6
      notificationId: `notif_${taskIds.length}`,
      userId: 'user_sam',
      subject: `${taskIds.length} activities updated`,
    });
  }
}
```

Why it is worse than it looks:

1. **The alerts module's own rules are skipped.** Channel routing
   (`SLA_BREACH`/`ESCALATION` → EMAIL, everything else → IN_APP), the
   `PENDING` initial status, the `alerts.notification.created` event that
   downstream consumers rely on — all bypassed. The row exists; the behaviour
   does not.
2. **The recipient is hardcoded.** The real rule is "escalate to the
   department lead, falling back to a store manager". That logic lives in the
   alerts module, and this code never reaches it.
3. **The `activities` module now owns an `alerts` schema decision.** Renaming a
   column in alerts silently breaks activities, and no test in the alerts
   module will catch it.
4. **The coupling is invisible in review.** One import line, at the top of a
   200-line file, in a diff about bulk status updates.

### The correct version

```ts
// ✅ src/modules/activities/activities.service.ts
await this.deps.repository.saveMany(updated);          // own state, first
await this.deps.events.publish([{                      // then announce it
  type: 'activities.bulk_status.completed',
  actor: { type: 'user', id: principal.userId },
  correlationId,
  payload: { bulkOperationId, storeId, updated: /* … */, failedCount, note },
}]);

// ✅ src/modules/alerts/alerts.subscribers.ts — alerts decides what to do
deps.events.subscribe(
  'activities.bulk_status.completed',
  'alerts.handover-summary',
  async (event) => {
    const managers = await deps.staff.listStoreManagers(event.payload.storeId);
    for (const manager of managers) {
      await deps.service.raise({ userId: manager.userId, type: 'SHIFT_HANDOVER', /* … */ });
    }
  },
);
```

The activities module now knows nothing about notifications. The alerts module
owns every decision about its own state. Either module can be rewritten
without touching the other.

---

## Where each kind of logic belongs

| Concern | Layer | Notes |
| --- | --- | --- |
| HTTP shape, validation, status codes | `<module>.routes.ts` | zod at the edge; no business rules |
| Authorisation of the caller | service (or routes for coarse role checks) | uses `Principal`, never raw request fields |
| Business rules | `<feature>.rules.ts`, pure | no I/O, so every rule is cheap to unit-test |
| Orchestration of read → rules → write → publish | `<module>.service.ts` | the only place that publishes events |
| Persistence | `<module>.repository.ts` | module-private |
| Reaction to another module's event | `<module>.subscribers.ts` | writes only this module's state |
| Wiring modules together | `src/app.ts` | the only file that knows about more than one module |

---

## Self-check before you hand off

- Every import in a file I changed points at `src/platform/**`,
  `src/contracts/**`, my own module, or a sibling's `index.ts`.
- No route file imports a sibling module.
- Any state change outside my module goes through an event.
- `npm run gate` reports no `MB-*` findings.
