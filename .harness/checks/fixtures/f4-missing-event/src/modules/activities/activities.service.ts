// FIXTURE — FAILURE MODE F4 (deliberate violations, do not copy).
//
// The bulk update lands in the activities store and stops there. The
// `activities.bulk_status.completed` event the spec requires is never
// published (EV-1), so the alerts module never raises a SHIFT_HANDOVER
// notification and the reports module never recomputes the store summary.
// Nothing fails. The incoming shift simply never hears about the handover —
// the hardest class of defect to find in review, and the reason EV-1 checks
// the catalogue rather than the code.
import type { ActivityRepository } from './activities.repository.js';

type EventBus = { publish(drafts: unknown[]): Promise<void> };

export class ActivityService {
  constructor(
    private readonly deps: { repository: ActivityRepository; events: EventBus },
  ) {}

  async bulkUpdateStatus(taskIds: string[], targetStatus: string): Promise<void> {
    for (const taskId of taskIds) {
      await this.deps.repository.save({ taskId, status: targetStatus, storeId: 'store_401' });
    }

    // EV-2: and when it does publish, it publishes an event owned by alerts.
    await this.deps.events.publish([
      { type: 'alerts.notification.created', payload: { notificationId: 'notif_1' } },
    ]);
  }
}
