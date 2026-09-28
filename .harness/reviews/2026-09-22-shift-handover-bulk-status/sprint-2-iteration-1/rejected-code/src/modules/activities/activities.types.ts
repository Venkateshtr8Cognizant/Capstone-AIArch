// REJECTED ITERATION 1 — preserved as evidence. Do not copy.
import type { TaskStatus } from '../../contracts/identity.js';

export type Task = {
  taskId: string;
  storeId: string;
  departmentId: string | null;
  assigneeId: string | null;
  title: string;
  status: TaskStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: 'RESTOCKING' | 'PLANOGRAM' | 'AUDIT' | 'COMPLIANCE' | 'GENERAL';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'BLOCKED', 'DONE'],
  IN_PROGRESS: ['BLOCKED', 'DONE'],
  BLOCKED: ['IN_PROGRESS', 'DONE'],
  DONE: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}
