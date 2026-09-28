// REJECTED ITERATION 1 — preserved as evidence. Do not copy.
import type { AlertRepository, Notification } from './alerts.repository.js';

export class AlertService {
  constructor(private readonly deps: { repository: AlertRepository }) {}

  async listForUser(userId: string): Promise<Notification[]> {
    return this.deps.repository.listForUser(userId);
  }

  /**
   * The correct entry point — which the activities module bypassed entirely.
   * Channel routing and the initial PENDING status live here, so a direct
   * repository write produces a row that no alerts rule has ever seen.
   */
  async raise(input: {
    userId: string;
    storeId: string;
    type: 'SHIFT_HANDOVER' | 'ESCALATION';
    subject: string;
    body: string;
  }): Promise<Notification> {
    const notification: Notification = {
      notificationId: `notif_${Date.now()}`,
      userId: input.userId,
      storeId: input.storeId,
      type: input.type,
      channel: input.type === 'ESCALATION' ? 'EMAIL' : 'IN_APP',
      status: 'PENDING',
      subject: input.subject,
      body: input.body,
      createdAt: new Date().toISOString(),
    };
    await this.deps.repository.save(notification);
    return notification;
  }
}
