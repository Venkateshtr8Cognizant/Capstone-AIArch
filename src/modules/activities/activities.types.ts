import type {
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from '../../contracts/events.js';
import type {
  DepartmentId,
  ProgrammeId,
  StoreId,
  TaskId,
  UserId,
} from '../../contracts/identity.js';

/** SPEC 3.3 — activities module key types. */

export type TaskAuditEntry = {
  at: string;
  actorId: string;
  action: 'created' | 'updated' | 'status_changed' | 'bulk_status_changed' | 'deleted';
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  note: string | null;
};

export type Task = {
  taskId: TaskId;
  storeId: StoreId;
  programmeId: ProgrammeId | null;
  departmentId: DepartmentId | null;
  assigneeId: UserId | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  dueAt: string | null;
  createdBy: UserId;
  createdAt: string;
  updatedAt: string;
  /** Append-only. Every status change adds an entry (SPEC 3.4, BR-8). */
  audit: TaskAuditEntry[];
};

export const TASK_STATUSES: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const TASK_CATEGORIES: readonly TaskCategory[] = [
  'RESTOCKING',
  'PLANOGRAM',
  'AUDIT',
  'COMPLIANCE',
  'GENERAL',
];

/**
 * Legal status transitions.
 *
 * `DONE` is terminal: reopening completed work would corrupt the completion
 * metrics the reports module aggregates. `BLOCKED` can be resumed.
 */
export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'BLOCKED', 'DONE'],
  IN_PROGRESS: ['BLOCKED', 'DONE'],
  BLOCKED: ['IN_PROGRESS', 'DONE'],
  DONE: [],
};

/** Statuses a bulk shift-handover request may set (SPEC 3.4, feature 1). */
export const BULK_TARGET_STATUSES = ['DONE', 'BLOCKED'] as const;
export type BulkTargetStatus = (typeof BULK_TARGET_STATUSES)[number];

/** Maximum items accepted in one bulk status request (BR-1). */
export const MAX_BULK_BATCH_SIZE = 50;

/** Priorities that escalate when a task is blocked or breaches SLA. */
export const ESCALATING_PRIORITIES: readonly TaskPriority[] = ['HIGH', 'CRITICAL'];

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export function appendAudit(task: Task, entry: TaskAuditEntry): Task {
  return { ...task, audit: [...task.audit, entry], updatedAt: entry.at };
}
