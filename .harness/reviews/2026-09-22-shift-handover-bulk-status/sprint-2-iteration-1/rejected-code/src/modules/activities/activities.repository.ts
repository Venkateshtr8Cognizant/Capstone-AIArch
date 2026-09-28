// REJECTED ITERATION 1 — preserved as evidence. Do not copy.
import type { Task } from './activities.types.js';

export interface ActivityRepository {
  find(taskId: string): Promise<Task | null>;
  findMany(taskIds: readonly string[]): Promise<Task[]>;
  saveMany(tasks: readonly Task[]): Promise<void>;
}
