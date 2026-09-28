# Skill — event bus integration

**Prevents failure mode F4:** missing event bus integration — state changes
written directly to sibling module repositories.

**Enforced by:** `.harness/checks/check-events.mjs` — rules `EV-1`…`EV-7`.

---

## F4 is not the same defect as F1

F1 is the *illegal* cross-module write: an import that should not exist. The
gate sees it immediately.

F4 is the **omission**. The code is clean, the boundaries are respected, the
compiler is happy — and the cross-module side effect was simply never wired.
The bulk handover updates the activities store and stops. No `SHIFT_HANDOVER`
alert reaches the incoming shift. No store summary is recomputed. Nothing
fails, no test goes red, and the defect surfaces weeks later as "the handover
notifications don't work".

This is why `EV-1` checks the **event catalogue** rather than the code: if the
specification says a channel exists and nobody publishes on it, that is a
finding, whatever the code looks like.

---

## The catalogue is the contract

`src/contracts/events.ts` holds `StoreOpsEventMap` (type name → payload) and
`EVENT_OWNERS` (type name → owning module). Adding a cross-module channel means
adding a line to both, which is deliberate: every new coupling becomes visible
in the diff, to the reviewer, and to the gate.

```ts
export type StoreOpsEventMap = {
  'activities.task.created': TaskCreatedPayload;
  'activities.task.status_changed': TaskStatusChangedPayload;
  'activities.bulk_status.completed': BulkStatusCompletedPayload;
  'programmes.member.added': ProgrammeMemberAddedPayload;
  'programmes.programme.closed': ProgrammeClosedPayload;
  'alerts.notification.created': NotificationCreatedPayload;
  'reports.report.requested': ReportRequestedPayload;
};

export const EVENT_OWNERS: Record<StoreOpsEventType, StoreOpsModule> = {
  'activities.bulk_status.completed': 'activities',
  // …
};
```

Naming: `<module>.<aggregate>.<past-tense-verb>`. Events are facts about
something that has already happened, never commands. `activities.task.completed`
— not `activities.complete_task`. If you find yourself wanting a command
event, what you actually want is a read port call.

---

## Publishing: order matters

Inside a service method the sequence is fixed:

```
read (own repository, and sibling read ports)
  → evaluate rules (pure)
    → write (own repository)
      → publish (after the write succeeds)
```

```ts
// ✅ src/modules/activities/activities.service.ts
await this.deps.repository.saveMany(updated);            // 1. own state first
await this.deps.events.publish([{                        // 2. then announce it
  type: 'activities.bulk_status.completed',
  actor: { type: 'user', id: principal.userId },
  correlationId,                                         // 3. always propagate
  payload: {
    bulkOperationId,
    storeId: principal.storeId,
    requestedBy: principal.userId,
    targetStatus: request.targetStatus,
    updated: plan.accepted.map(({ task, fromStatus }) => ({
      taskId: task.taskId, fromStatus, priority: task.priority,
      category: task.category, departmentId: task.departmentId,
      assigneeId: task.assigneeId,
    })),
    failedCount: plan.failed.length,
    note,
  },
}]);
```

Publishing before the write (`EV-7`) means a subscriber can alert a store
manager about work that never landed. Publishing from a route (`EV-4`) splits
the state change from its announcement, so a second caller of the same service
silently skips the event — which is F4 reintroduced.

### Payload design — the rule that prevents F1 coming back

**A subscriber must be able to act using the payload alone, plus its own state
and read ports.** If a subscriber has to call back into the publishing module
to find out what happened, the payload is underspecified, and the next
developer will reach for the repository instead.

That is why `BulkStatusCompletedPayload` carries `priority`, `category`,
`departmentId` and `assigneeId` per item rather than just the ids: the alerts
module needs them for escalation routing, and without them it would have to
fetch each activity back.

Include only what consumers need — a payload that mirrors the whole entity
couples every consumer to your schema.

---

## Subscribing

Subscribers live in `<module>.subscribers.ts`, are registered from the module
factory, and write **only their own module's state**.

```ts
// ✅ src/modules/alerts/alerts.subscribers.ts
export function registerAlertSubscribers(deps: {
  events: EventBus; service: AlertService; staff: StaffReadPort; logger: Logger;
}): void {
  deps.events.subscribe(
    'activities.bulk_status.completed',
    'alerts.handover-summary',              // '<module>.<purpose>' — EV-3
    async (event) => {
      const managers = await deps.staff.listStoreManagers(event.payload.storeId);
      if (managers.length === 0) {
        deps.logger.warn('alerts.handover_summary_unroutable', {
          bulkOperationId: event.payload.bulkOperationId,
          correlationId: event.correlationId,
        });
        return;
      }
      for (const manager of managers) {
        await deps.service.raise({ userId: manager.userId, type: 'SHIFT_HANDOVER', /* … */ });
      }
    },
  );
}
```

The subscriber name is not decoration: it appears in
`event.subscriber_failed` log lines and in the dead-letter record, so a
failure in production names the owning module immediately.

### Subscriber failure semantics

`InMemoryEventBus` isolates subscribers: a throwing subscriber is logged and
dead-lettered, and the publisher's request still succeeds. So:

- A subscriber must **never** be the place a business invariant is enforced.
  If the operation must not succeed unless X happens, X belongs in the service
  method, before the publish.
- A subscriber that cannot act should log at `warn` with the correlation id and
  return — not throw. Throw only for genuinely unexpected failures, where
  dead-lettering is the right outcome.
- Subscribers should be idempotent: assume at-least-once delivery, because a
  broker-backed bus will give you exactly that.

---

## Rules in brief

| Rule | Requirement |
| --- | --- |
| `EV-1` | Every event in `EVENT_OWNERS` has at least one publisher. A declared-but-unpublished event means a state change is happening somewhere it shouldn't. |
| `EV-2` | Only the owning module publishes an event. |
| `EV-3` | Subscribers live in `<module>.subscribers.ts` and are named `<module>.<purpose>`. |
| `EV-4` | Route files never publish. |
| `EV-5` | No module imports a sibling's `*.service.ts`, `*.repository.ts` or `*.subscribers.ts`. |
| `EV-6` | *(advisory)* A published event with no in-process subscriber — fine if the consumer is downstream, a dead channel otherwise. |
| `EV-7` | *(advisory)* The first `publish()` in a service appears before the first repository write. |

## Testing the wiring

Never assert an event happened by reading the subscriber's repository —
`MB-5`/`MB-6` forbid it, and it tests two things at once. Assert on the bus,
then on the consumer's public surface:

```ts
// the event was published, with the payload a consumer needs
const events = fixture.events('activities.bulk_status.completed');
expect(events).toHaveLength(1);
expect(events[0]?.payload.updated).toHaveLength(2);

// someone is actually listening (catches F4 directly)
expect(fixture.subscribersOf('activities.bulk_status.completed')).toEqual([
  'alerts.handover-summary',
  'reports.store-summary-on-handover',
]);

// and the consumer acted, observed through its own public API
const alerts = await request(fixture.app).get('/api/alerts').set(...auth('storeManager'));
expect(alerts.body.data[0]).toMatchObject({ type: 'SHIFT_HANDOVER' });
```

That middle assertion is the one that would have caught the client's original
F4 defect.

## Self-check before you hand off

- Every new cross-module effect is a line in `StoreOpsEventMap` + `EVENT_OWNERS`.
- Publish happens after the write, in the service, exactly once per operation.
- The payload lets each subscriber act without calling back into my module.
- A subscriber exists for every event a sibling module is supposed to react to.
- A test asserts both the publish and the subscriber list.
- `npm run gate` reports no `EV-*` blocking findings.
