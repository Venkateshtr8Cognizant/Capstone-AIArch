import { BusinessRuleError } from '../../platform/errors/index.js';
import type { ActivityRepository, Task } from './activities.repository.js';

type EventBus = { publish(drafts: unknown[]): Promise<void> };

/** Clean reference shape: typed errors, write then publish. */
export class ActivityService {
  constructor(
    private readonly deps: { repository: ActivityRepository; events: EventBus },
  ) {}

  async create(task: Task): Promise<Task> {
    if (!task.storeId) {
      throw new BusinessRuleError('ACT-1', 'An activity must belong to a store');
    }

    await this.deps.repository.save(task);
    await this.deps.events.publish([
      {
        type: 'activities.task.created',
        payload: { taskId: task.taskId, storeId: task.storeId },
      },
    ]);

    return task;
  }
}
