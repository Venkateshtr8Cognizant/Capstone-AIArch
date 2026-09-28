export type Notification = {
  notificationId: string;
  userId: string;
  subject: string;
};

/** Module-private to alerts. */
export interface AlertRepository {
  save(notification: Notification): Promise<void>;
}

export class InMemoryAlertRepository implements AlertRepository {
  private readonly rows = new Map<string, Notification>();

  async save(notification: Notification): Promise<void> {
    this.rows.set(notification.notificationId, notification);
  }
}
