import type { AlertType } from '../../contracts/events.js';
import type { Principal, StoreId, UserId } from '../../contracts/identity.js';
import { NotFoundError } from '../../platform/errors/index.js';
import type { EventBus } from '../../platform/events/event-bus.js';
import type { Clock } from '../../platform/support/clock.js';
import type { IdGenerator } from '../../platform/support/ids.js';
import type { Logger } from '../../platform/support/logger.js';
import type { AlertRepository } from './alerts.repository.js';
import { channelFor, type Notification } from './alerts.types.js';

export type NotificationView = Notification;

/** Read-only surface offered to sibling modules. */
export interface AlertReadPort {
  listForUser(userId: UserId): Promise<Notification[]>;
}

export class AlertService implements AlertReadPort {
  constructor(
    private readonly deps: {
      repository: AlertRepository;
      events: EventBus;
      clock: Clock;
      ids: IdGenerator;
      logger: Logger;
    },
  ) {}

  /** GET /api/alerts — alerts for the authenticated user. */
  async listForPrincipal(principal: Principal): Promise<Notification[]> {
    return this.deps.repository.listForUser(principal.userId);
  }

  async listForUser(userId: UserId): Promise<Notification[]> {
    return this.deps.repository.listForUser(userId);
  }

  async get(notificationId: string): Promise<Notification> {
    const notification = await this.deps.repository.find(notificationId);
    if (!notification) {
      throw new NotFoundError('Notification', notificationId);
    }
    return notification;
  }

  /**
   * Creates a notification. Called by this module's own subscribers (and its
   * routes), never by a sibling module: alerts state changes only in
   * reaction to an event the alerts module consumes.
   */
  async raise(input: {
    userId: UserId;
    storeId: StoreId;
    type: AlertType;
    subject: string;
    body: string;
    correlationId: string;
    sourceEventId?: string | null;
  }): Promise<Notification> {
    const notification: Notification = {
      notificationId: this.deps.ids.next('notif'),
      userId: input.userId,
      storeId: input.storeId,
      type: input.type,
      channel: channelFor(input.type),
      status: 'PENDING',
      subject: input.subject,
      body: input.body,
      correlationId: input.correlationId,
      createdAt: this.deps.clock.nowIso(),
      sourceEventId: input.sourceEventId ?? null,
    };

    await this.deps.repository.save(notification);
    await this.deps.events.publish([
      {
        type: 'alerts.notification.created',
        actor: { type: 'system', id: 'alerts' },
        correlationId: input.correlationId,
        payload: {
          notificationId: notification.notificationId,
          userId: notification.userId,
          storeId: notification.storeId,
          type: notification.type,
          channel: notification.channel,
          subject: notification.subject,
        },
      },
    ]);

    this.deps.logger.info('alerts.notification_raised', {
      notificationId: notification.notificationId,
      type: notification.type,
      channel: notification.channel,
      userId: notification.userId,
      correlationId: input.correlationId,
    });

    return notification;
  }
}
