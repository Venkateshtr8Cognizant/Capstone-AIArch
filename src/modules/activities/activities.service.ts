import type { TaskCategory, TaskPriority, TaskStatus } from '../../contracts/events.js';
import type {
  DepartmentId,
  Principal,
  ProgrammeId,
  StoreId,
  TaskId,
  UserId,
} from '../../contracts/identity.js';
import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../platform/errors/index.js';
import type { EventBus } from '../../platform/events/event-bus.js';
import type { Clock } from '../../platform/support/clock.js';
import type { IdGenerator } from '../../platform/support/ids.js';
import type { Logger } from '../../platform/support/logger.js';
import type { StaffReadPort } from '../staff/index.js';
import type { ActivityRepository, TaskFilter } from './activities.repository.js';
import { appendAudit, canTransition, type Task } from './activities.types.js';
import {
  mayUpdate,
  planBulkStatusUpdate,
  type BulkStatusRequest,
  type ItemFailure,
} from './bulk-status.rules.js';

export type TaskView = Omit<Task, 'audit'> & { auditEntryCount: number };

export type BulkStatusResult = {
  bulkOperationId: string;
  targetStatus: 'DONE' | 'BLOCKED';
  updatedCount: number;
  failedCount: number;
  updated: TaskView[];
  failed: ItemFailure[];
};

/**
 * activities service layer.
 *
 * Reads of staff data go through `StaffReadPort` (SPEC 3.3 cross-module rule
 * 1: read-only service lookups are permitted). Every cross-module SIDE
 * EFFECT — an alert, a report recompute — is published as an event and
 * applied by the owning module's own subscriber (rule 2). This service never
 * touches another module's repository.
 */
export class ActivityService {
  constructor(
    private readonly deps: {
      repository: ActivityRepository;
      staff: StaffReadPort;
      events: EventBus;
      clock: Clock;
      ids: IdGenerator;
      logger: Logger;
    },
  ) {}

  async list(
    principal: Principal,
    filter: { programmeId?: ProgrammeId; status?: TaskStatus } = {},
  ): Promise<TaskView[]> {
    const query: TaskFilter = { storeId: principal.storeId, ...filter };
    const tasks = await this.deps.repository.list(query);
    return tasks.map(toTaskView);
  }

  async get(principal: Principal, taskId: TaskId): Promise<TaskView> {
    const task = await this.loadOwnedTask(principal, taskId);
    return toTaskView(task);
  }

  async create(
    principal: Principal,
    input: {
      title: string;
      priority: TaskPriority;
      category: TaskCategory;
      programmeId?: ProgrammeId | null;
      departmentId?: DepartmentId | null;
      assigneeId?: UserId | null;
      dueAt?: string | null;
    },
    correlationId: string,
  ): Promise<TaskView> {
    // Read-only cross-module lookup through the staff public port.
    if (input.assigneeId) {
      const assignee = await this.deps.staff.findUser(input.assigneeId);
      if (!assignee) {
        throw new NotFoundError('User', input.assigneeId, { correlationId });
      }
      if (assignee.storeId !== principal.storeId) {
        throw new BusinessRuleError(
          'ACT-1',
          `Assignee '${input.assigneeId}' works at store '${assignee.storeId}', not '${principal.storeId}'`,
          {
            details: [{ path: 'assigneeId', message: 'must work at the same store', rule: 'ACT-1' }],
            correlationId,
          },
        );
      }
      if (!assignee.active) {
        throw new BusinessRuleError('ACT-2', `Assignee '${input.assigneeId}' is not active`, {
          details: [{ path: 'assigneeId', message: 'must be an active colleague', rule: 'ACT-2' }],
          correlationId,
        });
      }
    }

    if (input.dueAt && new Date(input.dueAt).getTime() <= this.deps.clock.now().getTime()) {
      throw new BusinessRuleError('ACT-3', 'Due date must be in the future', {
        details: [{ path: 'dueAt', message: 'must be in the future', rule: 'ACT-3' }],
        correlationId,
      });
    }

    const now = this.deps.clock.nowIso();
    const task: Task = {
      taskId: this.deps.ids.next('task'),
      storeId: principal.storeId,
      programmeId: input.programmeId ?? null,
      departmentId: input.departmentId ?? principal.departmentId,
      assigneeId: input.assigneeId ?? null,
      title: input.title,
      status: 'TODO',
      priority: input.priority,
      category: input.category,
      dueAt: input.dueAt ?? null,
      createdBy: principal.userId,
      createdAt: now,
      updatedAt: now,
      audit: [
        {
          at: now,
          actorId: principal.userId,
          action: 'created',
          fromStatus: null,
          toStatus: 'TODO',
          note: null,
        },
      ],
    };

    await this.deps.repository.save(task);
    await this.deps.events.publish([
      {
        type: 'activities.task.created',
        actor: { type: 'user', id: principal.userId },
        correlationId,
        payload: {
          taskId: task.taskId,
          storeId: task.storeId,
          programmeId: task.programmeId,
          departmentId: task.departmentId,
          assigneeId: task.assigneeId,
          status: task.status,
          priority: task.priority,
          category: task.category,
          dueAt: task.dueAt,
        },
      },
    ]);

    return toTaskView(task);
  }

  async patch(
    principal: Principal,
    taskId: TaskId,
    changes: {
      status?: TaskStatus;
      priority?: TaskPriority;
      category?: TaskCategory;
      assigneeId?: UserId | null;
      note?: string | null;
    },
    correlationId: string,
  ): Promise<TaskView> {
    const task = await this.loadOwnedTask(principal, taskId);

    if (!mayUpdate(task, principal)) {
      throw new AuthorizationError(
        `User '${principal.userId}' (${principal.role}) may not update activity '${taskId}'`,
        {
          details: [{ path: 'taskId', message: 'must be the assignee, department lead or store manager', rule: 'BR-7' }],
          correlationId,
        },
      );
    }

    if (changes.assigneeId) {
      const assignee = await this.deps.staff.findUser(changes.assigneeId);
      if (!assignee || assignee.storeId !== principal.storeId) {
        throw new BusinessRuleError(
          'ACT-1',
          `Assignee '${changes.assigneeId}' is not an active colleague at store '${principal.storeId}'`,
          {
            details: [{ path: 'assigneeId', message: 'must work at the same store', rule: 'ACT-1' }],
            correlationId,
          },
        );
      }
    }

    const now = this.deps.clock.nowIso();
    const fromStatus = task.status;
    const statusChanged = changes.status !== undefined && changes.status !== fromStatus;

    if (statusChanged && !canTransition(fromStatus, changes.status as TaskStatus)) {
      throw new ConflictError(
        `Activity '${taskId}' cannot move from ${fromStatus} to ${changes.status}`,
        { correlationId },
      );
    }
    if (changes.status === 'BLOCKED' && !changes.note?.trim()) {
      throw new BusinessRuleError('BR-3', 'A note explaining the blocker is required when setting BLOCKED', {
        details: [{ path: 'note', message: 'required when status is BLOCKED', rule: 'BR-3' }],
        correlationId,
      });
    }

    const updated = appendAudit(
      {
        ...task,
        status: changes.status ?? task.status,
        priority: changes.priority ?? task.priority,
        category: changes.category ?? task.category,
        assigneeId: changes.assigneeId === undefined ? task.assigneeId : changes.assigneeId,
      },
      {
        at: now,
        actorId: principal.userId,
        action: statusChanged ? 'status_changed' : 'updated',
        fromStatus: statusChanged ? fromStatus : null,
        toStatus: statusChanged ? (changes.status as TaskStatus) : null,
        note: changes.note ?? null,
      },
    );

    await this.deps.repository.save(updated);

    if (statusChanged) {
      // alerts and reports react to this event; this service never writes
      // to their repositories (SPEC 3.3 cross-module rule 2).
      await this.deps.events.publish([
        {
          type: 'activities.task.status_changed',
          actor: { type: 'user', id: principal.userId },
          correlationId,
          payload: {
            taskId: updated.taskId,
            storeId: updated.storeId,
            departmentId: updated.departmentId,
            assigneeId: updated.assigneeId,
            fromStatus,
            toStatus: updated.status,
            priority: updated.priority,
            category: updated.category,
            dueAt: updated.dueAt,
            bulkOperationId: null,
          },
        },
      ]);
    }

    return toTaskView(updated);
  }

  /** DELETE is restricted to the creator or a store manager (SPEC 3.6). */
  async remove(principal: Principal, taskId: TaskId, correlationId: string): Promise<void> {
    const task = await this.loadOwnedTask(principal, taskId);
    const isOwner = task.createdBy === principal.userId;
    const isManager = principal.role === 'STORE_MANAGER' || principal.role === 'REGIONAL_MANAGER';

    if (!isOwner && !isManager) {
      throw new AuthorizationError(
        `User '${principal.userId}' (${principal.role}) may not delete activity '${taskId}'`,
        {
          details: [{ path: 'taskId', message: 'must be the creator or a store manager' }],
          correlationId,
        },
      );
    }

    await this.deps.repository.remove(taskId);
    this.deps.logger.info('activities.task_deleted', {
      taskId,
      deletedBy: principal.userId,
      correlationId,
    });
  }

  /**
   * SPEC 3.4 feature 1 — shift handover bulk status update.
   *
   * Sequence, in this order and no other:
   *  1. load the batch from this module's own repository;
   *  2. evaluate every rule as a pure function, producing an accepted set and
   *     a per-item failure set (BR-1..BR-9). Partial failure is decided
   *     BEFORE any write, so a rejected item never leaves a half-written row;
   *  3. persist the accepted subset in one commit, with an audit entry per
   *     updated activity (BR-8);
   *  4. publish exactly one `activities.bulk_status.completed` AFTER the
   *     write succeeds (BR-10). The alerts and reports modules react in
   *     their own subscribers; this service writes nothing of theirs (BR-11).
   */
  async bulkUpdateStatus(
    principal: Principal,
    request: BulkStatusRequest,
    correlationId: string,
  ): Promise<BulkStatusResult> {
    const tasks = await this.deps.repository.findMany(request.taskIds);
    const plan = planBulkStatusUpdate({ request, tasks, principal });

    if (plan.rejections.length > 0) {
      const primaryRule = plan.rejections[0]?.rule ?? 'BR-0';
      this.deps.logger.warn('activities.bulk_status_rejected', {
        requestedCount: request.taskIds.length,
        targetStatus: request.targetStatus,
        rules: [...new Set(plan.rejections.map((rejection) => rejection.rule))],
        itemFailureCount: plan.failed.length,
        userId: principal.userId,
        correlationId,
      });
      throw new BusinessRuleError(
        primaryRule,
        `Bulk status update rejected: ${plan.rejections.length} request-level violation(s)`,
        {
          correlationId,
          details: [
            ...plan.rejections.map((rejection) => ({
              path: rejection.path,
              message: rejection.message,
              rule: rejection.rule,
            })),
            ...plan.failed.map((failure) => ({
              path: `taskIds.${failure.taskId}`,
              message: failure.message,
              rule: failure.rule,
            })),
          ],
        },
      );
    }

    const now = this.deps.clock.nowIso();
    const bulkOperationId = this.deps.ids.next('bulk');
    const note = request.note?.trim() ? request.note.trim() : null;

    // BR-8 — one audit entry per updated activity.
    const updated: Task[] = plan.accepted.map(({ task, fromStatus }) =>
      appendAudit(
        { ...task, status: request.targetStatus },
        {
          at: now,
          actorId: principal.userId,
          action: 'bulk_status_changed',
          fromStatus,
          toStatus: request.targetStatus,
          note,
        },
      ),
    );

    await this.deps.repository.saveMany(updated);

    // BR-10 — exactly one event, after the write, listing only what changed.
    await this.deps.events.publish([
      {
        type: 'activities.bulk_status.completed',
        actor: { type: 'user', id: principal.userId },
        correlationId,
        payload: {
          bulkOperationId,
          storeId: principal.storeId,
          requestedBy: principal.userId,
          targetStatus: request.targetStatus,
          updated: plan.accepted.map(({ task, fromStatus }) => ({
            taskId: task.taskId,
            fromStatus,
            priority: task.priority,
            category: task.category,
            departmentId: task.departmentId,
            assigneeId: task.assigneeId,
          })),
          failedCount: plan.failed.length,
          note,
        },
      },
    ]);

    this.deps.logger.info('activities.bulk_status_completed', {
      bulkOperationId,
      targetStatus: request.targetStatus,
      updatedCount: updated.length,
      failedCount: plan.failed.length,
      userId: principal.userId,
      correlationId,
    });

    return {
      bulkOperationId,
      targetStatus: request.targetStatus,
      updatedCount: updated.length,
      failedCount: plan.failed.length,
      updated: updated.map(toTaskView),
      failed: plan.failed,
    };
  }

  /** Read port used by the reports module (read-only, cross-module rule 1). */
  async listForStore(storeId: StoreId): Promise<TaskView[]> {
    const tasks = await this.deps.repository.listByStore(storeId);
    return tasks.map(toTaskView);
  }

  private async loadOwnedTask(principal: Principal, taskId: TaskId): Promise<Task> {
    const task = await this.deps.repository.find(taskId);
    if (!task || task.storeId !== principal.storeId) {
      // A cross-store id is reported as not found, so the API does not leak
      // the existence of another store's activities.
      throw new NotFoundError('Activity', taskId);
    }
    return task;
  }
}

function toTaskView(task: Task): TaskView {
  const { audit, ...rest } = task;
  return { ...rest, auditEntryCount: audit.length };
}
