// REJECTED ITERATION 1 — preserved as evidence. Do not copy.
//
// Sprint 2 was meant to add the event publication and let alerts/reports
// react. Instead this attempt wires the notification in by hand and never
// publishes the event at all.
import type { Principal, TaskStatus } from '../../contracts/identity.js';
import { NotFoundError } from '../../platform/errors/index.js';
// ❌ F1 / MB-1 / MB-6 — reaching into a sibling module's private repository.
import { InMemoryAlertRepository } from '../alerts/alerts.repository.js';
// ❌ F1 / EV-5 — importing a sibling module's service implementation.
import { AlertService } from '../alerts/alerts.service.js';
import type { ActivityRepository } from './activities.repository.js';
import { canTransition, type Task } from './activities.types.js';

type EventBus = { publish(drafts: unknown[]): Promise<void> };

export type BulkStatusResult = {
  bulkOperationId: string;
  updatedCount: number;
  failedCount: number;
  updated: Task[];
  failed: Array<{ taskId: string; reason: string }>;
};

export class ActivityService {
  // ❌ F1 — the activities module now owns an alerts persistence decision.
  private readonly alertRepository = new InMemoryAlertRepository();
  private readonly alertService = new AlertService({ repository: this.alertRepository });

  constructor(
    private readonly deps: { repository: ActivityRepository; events: EventBus },
  ) {}

  async bulkUpdateStatus(
    principal: Principal,
    request: { taskIds: string[]; targetStatus: 'DONE' | 'BLOCKED'; note?: string | null },
    correlationId: string,
  ): Promise<BulkStatusResult> {
    // ❌ F2 / EH-1 — a client mistake becomes a 500 INTERNAL_ERROR, pages
    // on-call, and carries no rule id so no rule-level test is possible.
    if (request.taskIds.length === 0) {
      throw new Error('taskIds must not be empty');
    }
    if (request.taskIds.length > 50) {
      throw new Error('too many taskIds');
    }

    const tasks = await this.deps.repository.findMany(request.taskIds);
    const updated: Task[] = [];
    const failed: Array<{ taskId: string; reason: string }> = [];

    for (const taskId of request.taskIds) {
      const task = tasks.find((candidate) => candidate.taskId === taskId);
      if (!task) {
        // Loses the stable code and the rule id the contract specifies.
        failed.push({ taskId, reason: 'not found' });
        continue;
      }
      if (task.storeId !== principal.storeId) {
        failed.push({ taskId, reason: 'wrong store' });
        continue;
      }
      if (!canTransition(task.status, request.targetStatus)) {
        failed.push({ taskId, reason: 'bad transition' });
        continue;
      }

      updated.push({
        ...task,
        status: request.targetStatus,
        updatedAt: new Date().toISOString(),
        // ❌ BR-8 — no audit entry appended.
      });
    }

    await this.deps.repository.saveMany(updated);

    // ❌ F1 — writing the sibling module's state directly. The recipient is
    // hardcoded rather than resolved from the roster, the channel policy is
    // skipped, and alerts.notification.created is never emitted.
    await this.alertRepository.save({
      notificationId: `notif_${Date.now()}`,
      userId: 'user_sam',
      storeId: principal.storeId,
      type: 'SHIFT_HANDOVER',
      channel: 'IN_APP',
      status: 'SENT',
      subject: `${updated.length} activities updated`,
      body: `Handover by ${principal.userId}`,
      createdAt: new Date().toISOString(),
    });

    // ❌ F4 / EV-1 — activities.bulk_status.completed is declared in the
    // catalogue and in BR-10, and is never published. So reports never
    // recomputes the STORE_SUMMARY, and nothing anywhere fails.
    void this.deps.events;
    void correlationId;

    return {
      bulkOperationId: `bulk_${Date.now()}`,
      updatedCount: updated.length,
      failedCount: failed.length,
      updated,
      failed,
    };
  }

  async get(principal: Principal, taskId: string): Promise<Task> {
    const task = await this.deps.repository.find(taskId);
    if (!task || task.storeId !== principal.storeId) {
      throw new NotFoundError('Activity', taskId);
    }
    return task;
  }

  private statusOf(task: Task): TaskStatus {
    return task.status;
  }
}
