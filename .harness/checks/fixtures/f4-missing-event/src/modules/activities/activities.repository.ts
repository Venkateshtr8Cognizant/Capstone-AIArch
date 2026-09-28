export type Task = { taskId: string; storeId: string; status: string };

export interface ActivityRepository {
  save(task: Task): Promise<void>;
}
