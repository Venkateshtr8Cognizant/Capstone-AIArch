// REJECTED ITERATION 1 — preserved as evidence. Do not copy.
export type Notification = {
  notificationId: string;
  userId: string;
  storeId: string;
  type: 'SHIFT_HANDOVER' | 'ESCALATION';
  channel: 'IN_APP' | 'EMAIL';
  status: 'PENDING' | 'SENT' | 'READ' | 'FAILED';
  subject: string;
  body: string;
  createdAt: string;
};

/** Module-private to alerts. */
export interface AlertRepository {
  save(notification: Notification): Promise<void>;
  listForUser(userId: string): Promise<Notification[]>;
}

export class InMemoryAlertRepository implements AlertRepository {
  private readonly rows = new Map<string, Notification>();

  async save(notification: Notification): Promise<void> {
    this.rows.set(notification.notificationId, notification);
  }

  async listForUser(userId: string): Promise<Notification[]> {
    return [...this.rows.values()].filter((row) => row.userId === userId);
  }
}
