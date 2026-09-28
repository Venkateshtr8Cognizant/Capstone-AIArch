// FIXTURE — FAILURE MODE F1 (deliberate violation, do not copy).
//
// This is the exact shape of the defect the client's prior AI pilot produced:
// the activities module reaches straight into the alerts module's repository
// to insert a notification, bypassing both the alerts public contract and the
// event bus. It compiles, the tests pass, and the alerts module's own rules
// (channel routing, escalation policy) are silently skipped.
import { InMemoryAlertRepository } from '../alerts/alerts.repository.js';
import type { AlertRepository } from '../alerts/alerts.repository.js';
import { AlertService } from '../alerts/alerts.service.js';

type Task = { taskId: string; storeId: string; status: string };

export class ActivityService {
  private readonly alerts: AlertRepository = new InMemoryAlertRepository();
  private readonly alertService = new AlertService();

  async bulkUpdateStatus(taskIds: string[], storeId: string): Promise<void> {
    // ... update activities ...

    // F1: writing a sibling module's state directly.
    await this.alerts.save({
      notificationId: `notif_${taskIds.length}`,
      userId: 'user_sam',
      subject: `${taskIds.length} activities updated in ${storeId}`,
    });

    // F1: calling a sibling module's service implementation for a write.
    await this.alertService.markSent('notif_1');
  }
}
