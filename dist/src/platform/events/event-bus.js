/**
 * In-process event bus used by the reference project.
 *
 * Behaviour the harness and the tests rely on:
 *  - subscriber isolation: a throwing subscriber is dead-lettered and logged,
 *    it never fails the publisher's request;
 *  - ordered dispatch: events in publish order, subscribers in registration
 *    order, so integration tests are deterministic;
 *  - a full publish log, so tests assert on emitted events instead of
 *    reaching into a sibling module's state.
 *
 * Replacing this with a broker-backed implementation (SNS/SQS, Service Bus,
 * Kafka) is a platform change only: modules depend on the `EventBus`
 * interface, not on this class.
 */
export class InMemoryEventBus {
    deps;
    handlers = new Map();
    publishLog = [];
    deadLetters = [];
    constructor(deps) {
        this.deps = deps;
    }
    async publish(drafts) {
        const events = drafts.map((draft) => ({
            eventId: this.deps.ids.next('evt'),
            type: draft.type,
            occurredAt: this.deps.clock.nowIso(),
            actor: draft.actor,
            correlationId: draft.correlationId,
            version: 1,
            payload: draft.payload,
        }));
        for (const event of events) {
            this.publishLog.push(event);
            const subscribers = this.handlers.get(event.type) ?? [];
            this.deps.logger.info('event.published', {
                eventId: event.eventId,
                type: event.type,
                correlationId: event.correlationId,
                subscriberCount: subscribers.length,
            });
            for (const { subscriberName, handler } of subscribers) {
                try {
                    await handler(event);
                }
                catch (error) {
                    this.deadLetters.push({ event, subscriberName, error });
                    this.deps.logger.error('event.subscriber_failed', {
                        eventId: event.eventId,
                        type: event.type,
                        subscriberName,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        }
        return events;
    }
    subscribe(type, subscriberName, handler) {
        const existing = this.handlers.get(type) ?? [];
        existing.push({ subscriberName, handler: handler });
        this.handlers.set(type, existing);
    }
    /** Test and diagnostic access; not used by production code paths. */
    published(type) {
        const all = this.publishLog;
        return type ? all.filter((event) => event.type === type) : all;
    }
    deadLettered() {
        return this.deadLetters;
    }
    subscriberNames(type) {
        return (this.handlers.get(type) ?? []).map((entry) => entry.subscriberName);
    }
}
//# sourceMappingURL=event-bus.js.map