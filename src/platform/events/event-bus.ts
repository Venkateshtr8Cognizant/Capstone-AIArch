import type { StoreOpsEventMap, StoreOpsEventType } from '../../contracts/events.js';
import type { Actor } from '../../contracts/identity.js';
import type { Clock } from '../support/clock.js';
import type { IdGenerator } from '../support/ids.js';
import type { Logger } from '../support/logger.js';

/** Immutable envelope every StoreOps domain event travels in. */
export type DomainEvent<TType extends StoreOpsEventType = StoreOpsEventType> = {
  readonly eventId: string;
  readonly type: TType;
  readonly occurredAt: string;
  readonly actor: Actor;
  readonly correlationId: string;
  /** Envelope version; bumped only for breaking envelope changes. */
  readonly version: 1;
  readonly payload: StoreOpsEventMap[TType];
};

export type EventHandler<TType extends StoreOpsEventType> = (
  event: DomainEvent<TType>,
) => Promise<void> | void;

/** Input accepted by `publish`; the bus stamps the envelope fields. */
export type EventDraft<TType extends StoreOpsEventType = StoreOpsEventType> = {
  type: TType;
  payload: StoreOpsEventMap[TType];
  actor: Actor;
  correlationId: string;
};

export type DeadLetter = {
  event: DomainEvent;
  subscriberName: string;
  error: unknown;
};

export interface EventBus {
  /**
   * Publish a batch of events. Called by the owning module's own service
   * AFTER its write to its own repository has succeeded, never before.
   */
  publish(drafts: EventDraft[]): Promise<DomainEvent[]>;
  subscribe<TType extends StoreOpsEventType>(
    type: TType,
    subscriberName: string,
    handler: EventHandler<TType>,
  ): void;
}

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
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<
    StoreOpsEventType,
    Array<{ subscriberName: string; handler: EventHandler<never> }>
  >();

  private readonly publishLog: DomainEvent[] = [];
  private readonly deadLetters: DeadLetter[] = [];

  constructor(
    private readonly deps: {
      clock: Clock;
      ids: IdGenerator;
      logger: Logger;
    },
  ) {}

  async publish(drafts: EventDraft[]): Promise<DomainEvent[]> {
    const events: DomainEvent[] = drafts.map((draft) => ({
      eventId: this.deps.ids.next('evt'),
      type: draft.type,
      occurredAt: this.deps.clock.nowIso(),
      actor: draft.actor,
      correlationId: draft.correlationId,
      version: 1 as const,
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
          await (handler as EventHandler<StoreOpsEventType>)(event);
        } catch (error) {
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

  subscribe<TType extends StoreOpsEventType>(
    type: TType,
    subscriberName: string,
    handler: EventHandler<TType>,
  ): void {
    const existing = this.handlers.get(type) ?? [];
    existing.push({ subscriberName, handler: handler as EventHandler<never> });
    this.handlers.set(type, existing);
  }

  /** Test and diagnostic access; not used by production code paths. */
  published<TType extends StoreOpsEventType>(type?: TType): DomainEvent<TType>[] {
    const all = this.publishLog as DomainEvent<TType>[];
    return type ? all.filter((event) => event.type === type) : all;
  }

  deadLettered(): readonly DeadLetter[] {
    return this.deadLetters;
  }

  subscriberNames(type: StoreOpsEventType): string[] {
    return (this.handlers.get(type) ?? []).map((entry) => entry.subscriberName);
  }
}
