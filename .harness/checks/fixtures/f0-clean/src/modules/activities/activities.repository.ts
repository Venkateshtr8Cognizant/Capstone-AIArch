export type Task = { taskId: string; storeId: string; status: string };

export interface ActivityRepository {
  save(task: Task): Promise<void>;
}

export class InMemoryActivityRepository implements ActivityRepository {
  private readonly tasks = new Map<string, Task>();

  async save(task: Task): Promise<void> {
    this.tasks.set(task.taskId, task);
  }
}
