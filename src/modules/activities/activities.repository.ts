import type { TaskStatus } from '../../contracts/events.js';
import type { ProgrammeId, StoreId, TaskId } from '../../contracts/identity.js';
import { InternalError } from '../../platform/errors/index.js';
import type { Task } from './activities.types.js';

export type TaskFilter = {
  storeId: StoreId;
  programmeId?: ProgrammeId;
  status?: TaskStatus;
};

/**
 * MODULE-PRIVATE. Only files inside `src/modules/activities/` may reference
 * this port.
 *
 * `saveMany` exists so a bulk status update writes the whole accepted subset
 * in one commit: partial failure is decided by the rule evaluation BEFORE
 * any write, never by a write that fails halfway (SPEC 3.4, BR-9).
 */
export interface ActivityRepository {
  find(taskId: TaskId): Promise<Task | null>;
  findMany(taskIds: readonly TaskId[]): Promise<Task[]>;
  list(filter: TaskFilter): Promise<Task[]>;
  listByStore(storeId: StoreId): Promise<Task[]>;
  save(task: Task): Promise<void>;
  saveMany(tasks: readonly Task[]): Promise<void>;
  remove(taskId: TaskId): Promise<void>;
}

export class InMemoryActivityRepository implements ActivityRepository {
  private readonly tasks = new Map<TaskId, Task>();

  async find(taskId: TaskId): Promise<Task | null> {
    const task = this.tasks.get(taskId);
    return task ? structuredClone(task) : null;
  }

  async findMany(taskIds: readonly TaskId[]): Promise<Task[]> {
    const found: Task[] = [];
    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId);
      if (task) {
        found.push(structuredClone(task));
      }
    }
    return found;
  }

  async list(filter: TaskFilter): Promise<Task[]> {
    return [...this.tasks.values()]
      .filter((task) => task.storeId === filter.storeId)
      .filter((task) => (filter.programmeId ? task.programmeId === filter.programmeId : true))
      .filter((task) => (filter.status ? task.status === filter.status : true))
      .map((task) => structuredClone(task))
      .sort((left, right) => left.taskId.localeCompare(right.taskId));
  }

  async listByStore(storeId: StoreId): Promise<Task[]> {
    return this.list({ storeId });
  }

  async save(task: Task): Promise<void> {
    this.tasks.set(task.taskId, structuredClone(task));
  }

  /**
   * Stages the whole batch before committing, so a mid-batch failure leaves
   * the store untouched. A relational implementation wraps this in a single
   * transaction.
   */
  async saveMany(tasks: readonly Task[]): Promise<void> {
    const staged = tasks.map((task) => structuredClone(task));
    for (const task of staged) {
      if (!task.taskId) {
        throw new InternalError('A task without an id reached saveMany');
      }
    }
    for (const task of staged) {
      this.tasks.set(task.taskId, task);
    }
  }

  async remove(taskId: TaskId): Promise<void> {
    this.tasks.delete(taskId);
  }
}
