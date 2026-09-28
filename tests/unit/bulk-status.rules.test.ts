import { describe, expect, it } from 'vitest';
import type { TaskStatus } from '../../src/contracts/events.js';
import type { Principal } from '../../src/contracts/identity.js';
import type { Task } from '../../src/modules/activities/activities.types.js';
import {
  mayUpdate,
  planBulkStatusUpdate,
  type BulkStatusRequest,
} from '../../src/modules/activities/bulk-status.rules.js';

/**
 * Rule-level unit tests for the shift handover bulk status update.
 *
 * Every assertion names the rule id from the sprint contract, so a failing
 * test tells the Generator which business rule regressed rather than only
 * which line broke.
 */

const STORE = 'store_401';
const DEPT = 'dept_grocery';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    taskId: 'task_0001',
    storeId: STORE,
    programmeId: null,
    departmentId: DEPT,
    assigneeId: 'user_alice',
    title: 'Restock aisle 4',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    category: 'RESTOCKING',
    dueAt: null,
    createdBy: 'user_priya',
    createdAt: '2026-09-22T06:05:00.000Z',
    updatedAt: '2026-09-22T06:05:00.000Z',
    audit: [],
    ...overrides,
  };
}

function makePrincipal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: 'user_priya',
    storeId: STORE,
    regionId: 'region_north',
    role: 'DEPARTMENT_LEAD',
    departmentId: DEPT,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<BulkStatusRequest> = {}): BulkStatusRequest {
  return { taskIds: ['task_0001'], targetStatus: 'DONE', ...overrides };
}

function rulesOf(items: Array<{ rule: string }>): string[] {
  return [...new Set(items.map((item) => item.rule))].sort();
}

describe('planBulkStatusUpdate — request-level rules', () => {
  it('accepts a valid batch and plans one write per activity', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ taskIds: ['task_0001', 'task_0002'] }),
      tasks: [makeTask(), makeTask({ taskId: 'task_0002', status: 'TODO' })],
      principal: makePrincipal(),
    });

    expect(plan.rejections).toEqual([]);
    expect(plan.failed).toEqual([]);
    expect(plan.accepted.map((item) => item.task.taskId)).toEqual(['task_0001', 'task_0002']);
    expect(plan.accepted.map((item) => item.fromStatus)).toEqual(['IN_PROGRESS', 'TODO']);
  });

  it('rejects an empty batch (BR-1)', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ taskIds: [] }),
      tasks: [],
      principal: makePrincipal(),
    });

    expect(rulesOf(plan.rejections)).toContain('BR-1');
    expect(plan.accepted).toEqual([]);
  });

  it('rejects a batch over the 50-item ceiling (BR-1)', () => {
    const taskIds = Array.from({ length: 51 }, (_, index) => `task_${String(index).padStart(4, '0')}`);
    const plan = planBulkStatusUpdate({
      request: makeRequest({ taskIds }),
      tasks: taskIds.map((taskId) => makeTask({ taskId })),
      principal: makePrincipal(),
    });

    expect(plan.rejections.some((item) => item.rule === 'BR-1' && /at most 50/.test(item.message))).toBe(true);
    expect(plan.accepted).toEqual([]);
  });

  it('rejects duplicate ids in one batch (BR-1)', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ taskIds: ['task_0001', 'task_0001'] }),
      tasks: [makeTask()],
      principal: makePrincipal(),
    });

    expect(plan.rejections.some((item) => item.rule === 'BR-1' && /more than once/.test(item.message))).toBe(true);
  });

  it('rejects a target status other than DONE or BLOCKED (BR-2)', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ targetStatus: 'IN_PROGRESS' as never }),
      tasks: [makeTask()],
      principal: makePrincipal(),
    });

    expect(rulesOf(plan.rejections)).toContain('BR-2');
  });

  it('requires a note when blocking work (BR-3)', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ targetStatus: 'BLOCKED' }),
      tasks: [makeTask()],
      principal: makePrincipal(),
    });

    expect(plan.rejections.some((item) => item.rule === 'BR-3' && item.path === 'note')).toBe(true);
  });

  it('accepts a blocking request that carries a note (BR-3)', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ targetStatus: 'BLOCKED', note: 'Cage not delivered' }),
      tasks: [makeTask()],
      principal: makePrincipal(),
    });

    expect(plan.rejections).toEqual([]);
    expect(plan.accepted).toHaveLength(1);
  });

  it('treats a whitespace-only note as missing (BR-3)', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ targetStatus: 'BLOCKED', note: '   ' }),
      tasks: [makeTask()],
      principal: makePrincipal(),
    });

    expect(rulesOf(plan.rejections)).toContain('BR-3');
  });

  it('does not evaluate items when the request itself is invalid', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ taskIds: [], targetStatus: 'BLOCKED' }),
      tasks: [makeTask()],
      principal: makePrincipal(),
    });

    expect(rulesOf(plan.rejections)).toEqual(['BR-1', 'BR-3']);
    expect(plan.failed).toEqual([]);
  });
});

describe('planBulkStatusUpdate — per-item rules (partial failure)', () => {
  it('fails an unknown activity and keeps the rest of the batch (BR-4)', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ taskIds: ['task_0001', 'task_missing'] }),
      tasks: [makeTask()],
      principal: makePrincipal(),
    });

    expect(plan.rejections).toEqual([]);
    expect(plan.accepted.map((item) => item.task.taskId)).toEqual(['task_0001']);
    expect(plan.failed).toEqual([
      {
        taskId: 'task_missing',
        code: 'ACTIVITY_NOT_FOUND',
        rule: 'BR-4',
        message: "Activity 'task_missing' does not exist",
      },
    ]);
  });

  it('fails an activity belonging to another store (BR-5)', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ taskIds: ['task_0001', 'task_0002'] }),
      tasks: [makeTask(), makeTask({ taskId: 'task_0002', storeId: 'store_902' })],
      principal: makePrincipal(),
    });

    expect(plan.failed).toEqual([
      expect.objectContaining({ taskId: 'task_0002', code: 'CROSS_STORE_FORBIDDEN', rule: 'BR-5' }),
    ]);
    expect(plan.accepted).toHaveLength(1);
  });

  it('refuses a cross-store activity even for a regional manager (BR-5)', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ taskIds: ['task_0002'] }),
      tasks: [makeTask({ taskId: 'task_0002', storeId: 'store_902' })],
      principal: makePrincipal({ role: 'REGIONAL_MANAGER', departmentId: null }),
    });

    expect(plan.failed[0]).toMatchObject({ code: 'CROSS_STORE_FORBIDDEN', rule: 'BR-5' });
    expect(plan.accepted).toEqual([]);
  });

  it.each<[TaskStatus, 'DONE' | 'BLOCKED', boolean]>([
    ['TODO', 'DONE', true],
    ['IN_PROGRESS', 'DONE', true],
    ['BLOCKED', 'DONE', true],
    ['DONE', 'DONE', false],
    ['TODO', 'BLOCKED', true],
    ['IN_PROGRESS', 'BLOCKED', true],
    ['BLOCKED', 'BLOCKED', false],
    ['DONE', 'BLOCKED', false],
  ])('transition %s -> %s is allowed: %s (BR-6)', (from, target, allowed) => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({
        targetStatus: target,
        ...(target === 'BLOCKED' ? { note: 'Cage not delivered' } : {}),
      }),
      tasks: [makeTask({ status: from })],
      principal: makePrincipal(),
    });

    expect(plan.accepted).toHaveLength(allowed ? 1 : 0);
    if (!allowed) {
      expect(plan.failed[0]).toMatchObject({ code: 'ILLEGAL_TRANSITION', rule: 'BR-6' });
      // Nothing succeeded, so the whole request is rejected under BR-9.
      expect(rulesOf(plan.rejections)).toContain('BR-9');
    }
  });

  it('fails an activity the caller neither owns nor supervises (BR-7)', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ taskIds: ['task_0001', 'task_0002'] }),
      tasks: [
        makeTask({ assigneeId: 'user_alice' }),
        makeTask({ taskId: 'task_0002', departmentId: 'dept_chilled', assigneeId: 'user_chen' }),
      ],
      principal: makePrincipal({ role: 'ASSOCIATE', userId: 'user_alice' }),
    });

    expect(plan.accepted.map((item) => item.task.taskId)).toEqual(['task_0001']);
    expect(plan.failed[0]).toMatchObject({ taskId: 'task_0002', code: 'NOT_PERMITTED', rule: 'BR-7' });
  });

  it('rejects the whole request when no item could be updated (BR-9)', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ taskIds: ['task_a', 'task_b'] }),
      tasks: [],
      principal: makePrincipal(),
    });

    expect(plan.accepted).toEqual([]);
    expect(plan.failed).toHaveLength(2);
    expect(plan.rejections.some((item) => item.rule === 'BR-9')).toBe(true);
  });

  it('reports every item failure in one pass so a batch can be fixed in one round trip', () => {
    const plan = planBulkStatusUpdate({
      request: makeRequest({ taskIds: ['task_0001', 'task_missing', 'task_done', 'task_other'] }),
      tasks: [
        makeTask(),
        makeTask({ taskId: 'task_done', status: 'DONE' }),
        makeTask({ taskId: 'task_other', storeId: 'store_902' }),
      ],
      principal: makePrincipal(),
    });

    expect(plan.accepted).toHaveLength(1);
    expect(rulesOf(plan.failed)).toEqual(['BR-4', 'BR-5', 'BR-6']);
  });
});

describe('mayUpdate (BR-7)', () => {
  const task = makeTask({ assigneeId: 'user_alice', departmentId: DEPT });

  it('allows the assignee', () => {
    expect(mayUpdate(task, makePrincipal({ role: 'ASSOCIATE', userId: 'user_alice' }))).toBe(true);
  });

  it('allows the department lead of the activity department', () => {
    expect(mayUpdate(task, makePrincipal({ role: 'DEPARTMENT_LEAD', departmentId: DEPT }))).toBe(true);
  });

  it('refuses a department lead from another department', () => {
    expect(
      mayUpdate(task, makePrincipal({ role: 'DEPARTMENT_LEAD', departmentId: 'dept_chilled' })),
    ).toBe(false);
  });

  it('allows store and regional managers', () => {
    expect(mayUpdate(task, makePrincipal({ role: 'STORE_MANAGER' }))).toBe(true);
    expect(mayUpdate(task, makePrincipal({ role: 'REGIONAL_MANAGER' }))).toBe(true);
  });

  it('refuses an unrelated associate', () => {
    expect(mayUpdate(task, makePrincipal({ role: 'ASSOCIATE', userId: 'user_chen' }))).toBe(false);
  });

  it('refuses a department lead when the activity has no department', () => {
    expect(
      mayUpdate(makeTask({ departmentId: null, assigneeId: null }), makePrincipal({ role: 'DEPARTMENT_LEAD' })),
    ).toBe(false);
  });
});
