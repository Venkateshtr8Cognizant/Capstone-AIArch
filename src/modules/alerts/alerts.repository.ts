import type { NotificationId, UserId } from '../../contracts/identity.js';
import type { Notification } from './alerts.types.js';

/**
 * MODULE-PRIVATE. Only files inside `src/modules/alerts/` may reference this
 * port.
 *
 * This is the repository the prior AI-assisted pilot wrote to directly from
 * the activities module (failure mode F4). The harness gate now fails any
 * such import, and the only way into this store is an alerts subscriber.
 */
export interface AlertRepository {
  save(notification: Notification): Promise<void>;
  listForUser(userId: UserId): Promise<Notification[]>;
  find(notificationId: NotificationId): Promise<Notification | null>;
}

export class InMemoryAlertRepository implements AlertRepository {
  private readonly notifications = new Map<NotificationId, Notification>();

  async save(notification: Notification): Promise<void> {
    this.notifications.set(notification.notificationId, { ...notification });
  }

  async listForUser(userId: UserId): Promise<Notification[]> {
    return [...this.notifications.values()]
      .filter((notification) => notification.userId === userId)
      .map((notification) => ({ ...notification }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async find(notificationId: NotificationId): Promise<Notification | null> {
    const notification = this.notifications.get(notificationId);
    return notification ? { ...notification } : null;
  }
}
