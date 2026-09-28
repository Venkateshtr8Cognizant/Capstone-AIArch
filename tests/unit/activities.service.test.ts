import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuthorizationError,
  BusinessRuleError,
  NotFoundError,
} from '../../src/platform/errors/index.js';
import {
  DEPT_CHILLED,
  DEPT_GROCERY,
  USERS,
  buildFixture,
  seedActivity,
  type Fixture,
} from '../support/storeops-fixture.js';

/**
 * Service-level behaviour of the activities module: persistence, the audit
 * trail, event emission, and the typed error contract.
 */
describe('ActivityService.bulkUpdateStatus', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await buildFixture();
  });

  it('sets every accepted activity to the target status', async () => {
    const first = await seedActivity(fixture);
    const second = await seedActivity(fixture, { title: 'Face up bakery shelf' });

    const result = await fixture.activities.service.bulkUpdateStatus(
      fixture.principal('groceryLead'),
      { taskIds: [first, second], targetStatus: 'DONE' },
      'corr_bulk_1',
    );

    expect(result.updatedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.updated.map((activity) => activity.status)).toEqual(['DONE', 'DONE']);

    const stored = await fixture.activities.service.get(fixture.principal('groceryLead'), first);
    expect(stored.status).toBe('DONE');
  });

  it('appends one audit entry per updated activity carrying the transition (BR-8)', async () => {
    const taskId = await seedActivity(fixture);

    await fixture.activities.service.bulkUpdateStatus(
      fixture.principal('groceryLead'),
      { taskIds: [taskId], targetStatus: 'BLOCKED', note: 'Cage did not arrive' },
      'corr_bulk_2',
    );

    // The audit trail is module-private; its growth is observable on the view.
    const view = await fixture.activities.service.get(fixture.principal('groceryLead'), taskId);
    expect(view.status).toBe('BLOCKED');
    expect(view.auditEntryCount).toBe(2); // created + bulk_status_changed

    const event = fixture.events('activities.bulk_status.completed')[0];
    expect(event?.payload.note).toBe('Cage did not arrive');
  });

  it('publishes exactly one bulk event listing only the activities that changed (BR-10)', async () => {
    const good = await seedActivity(fixture);
    const done = await seedActivity(fixture);
    await fixture.activities.service.patch(
      fixture.principal('groceryLead'),
      done,
      { status: 'DONE' },
      'corr_prep',
    );

    const result = await fixture.activities.service.bulkUpdateStatus(
      fixture.principal('groceryLead'),
      { taskIds: [good, done], targetStatus: 'DONE' },
      'corr_bulk_3',
    );

    const events = fixture.events('activities.bulk_status.completed');
    expect(events).toHaveLength(1);
    expect(events[0]?.payload.updated.map((item) => item.taskId)).toEqual([good]);
    expect(events[0]?.payload.failedCount).toBe(1);
    expect(events[0]?.correlationId).toBe('corr_bulk_3');
    expect(result.failed[0]).toMatchObject({ taskId: done, code: 'ILLEGAL_TRANSITION' });
  });

  it('applies the accepted subset and reports the rejected items (partial failure)', async () => {
    const mine = await seedActivity(fixture, { assigneeId: USERS.associateEarly.userId });
    const chilled = await seedActivity(fixture, {
      departmentId: DEPT_CHILLED,
      assigneeId: USERS.associateLate.userId,
      createdBy: 'chilledLead',
    });

    const result = await fixture.activities.service.bulkUpdateStatus(
      fixture.principal('associateEarly'),
      { taskIds: [mine, chilled, 'task_ghost'], targetStatus: 'DONE' },
      'corr_bulk_4',
    );

    expect(result.updatedCount).toBe(1);
    expect(result.updated[0]?.taskId).toBe(mine);
    expect(result.failed.map((failure) => failure.code).sort()).toEqual([
      'ACTIVITY_NOT_FOUND',
      'NOT_PERMITTED',
    ]);

    // The rejected chilled activity is untouched.
    const untouched = await fixture.activities.service.get(fixture.principal('chilledLead'), chilled);
    expect(untouched.status).toBe('TODO');
  });

  it('writes nothing and publishes nothing when the request is rejected (BR-1)', async () => {
    const taskId = await seedActivity(fixture);

    await expect(
      fixture.activities.service.bulkUpdateStatus(
        fixture.principal('groceryLead'),
        { taskIds: [taskId, taskId], targetStatus: 'DONE' },
        'corr_bulk_5',
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    const untouched = await fixture.activities.service.get(fixture.principal('groceryLead'), taskId);
    expect(untouched.status).toBe('TODO');
    expect(fixture.events('activities.bulk_status.completed')).toHaveLength(0);
  });

  it('raises a typed BusinessRuleError naming the rule and every item failure (BR-9)', async () => {
    const done = await seedActivity(fixture);
    await fixture.activities.service.patch(
      fixture.principal('groceryLead'),
      done,
      { status: 'DONE' },
      'corr_prep',
    );

    const error = (await fixture.activities.service
      .bulkUpdateStatus(
        fixture.principal('groceryLead'),
        { taskIds: [done, 'task_ghost'], targetStatus: 'DONE' },
        'corr_bulk_6',
      )
      .catch((caught: unknown) => caught)) as BusinessRuleError;

    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error.rule).toBe('BR-9');
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(error.correlationId).toBe('corr_bulk_6');
    expect(error.details.map((detail) => detail.rule).sort()).toEqual(['BR-4', 'BR-6', 'BR-9']);
    expect(fixture.events('activities.bulk_status.completed')).toHaveLength(0);
  });

  it('hands alerts and reports work to their own subscribers, never writing their state (BR-11)', async () => {
    const taskId = await seedActivity(fixture);

    await fixture.activities.service.bulkUpdateStatus(
      fixture.principal('groceryLead'),
      { taskIds: [taskId], targetStatus: 'DONE' },
      'corr_bulk_7',
    );

    // Alerts state changed only because the alerts module subscribed.
    const managerAlerts = await fixture.alerts.service.listForUser(USERS.storeManager.userId);
    expect(managerAlerts).toHaveLength(1);
    expect(managerAlerts[0]).toMatchObject({ type: 'SHIFT_HANDOVER', channel: 'IN_APP' });

    // Reports state changed only because the reports module subscribed.
    const report = await fixture.reports.service.findLatest('STORE_SUMMARY', 'store_401');
    expect(report?.status).toBe('READY');
    expect(report?.metrics?.completedActivities).toBe(1);

    expect(fixture.subscribersOf('activities.bulk_status.completed')).toEqual([
      'alerts.handover-summary',
      'reports.store-summary-on-handover',
    ]);
  });
});

describe('ActivityService — base surface', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await buildFixture();
  });

  it('creates an activity in TODO with an audit entry and an event', async () => {
    const activity = await fixture.activities.service.create(
      fixture.principal('groceryLead'),
      { title: 'Audit chilled temperatures', priority: 'HIGH', category: 'AUDIT' },
      'corr_create',
    );

    expect(activity.status).toBe('TODO');
    expect(activity.departmentId).toBe(DEPT_GROCERY);
    expect(activity.auditEntryCount).toBe(1);
    expect(fixture.events('activities.task.created')[0]?.payload.taskId).toBe(activity.taskId);
  });

  it('refuses an assignee from another store (ACT-1)', async () => {
    const error = (await fixture.activities.service
      .create(
        fixture.principal('groceryLead'),
        {
          title: 'Restock with the wrong colleague',
          priority: 'LOW',
          category: 'GENERAL',
          assigneeId: 'user_erin',
        },
        'corr_create_bad',
      )
      .catch((caught: unknown) => caught)) as BusinessRuleError;

    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error.rule).toBe('ACT-1');
    expect(fixture.events('activities.task.created')).toHaveLength(0);
  });

  it('refuses a due date in the past (ACT-3)', async () => {
    const error = (await fixture.activities.service
      .create(
        fixture.principal('groceryLead'),
        {
          title: 'Backdated compliance check',
          priority: 'LOW',
          category: 'COMPLIANCE',
          dueAt: '2026-09-21T10:00:00.000Z',
        },
        'corr_create_past',
      )
      .catch((caught: unknown) => caught)) as BusinessRuleError;

    expect(error.rule).toBe('ACT-3');
  });

  it('hides another store\'s activity behind a 404 rather than a 403', async () => {
    const taskId = await seedActivity(fixture);
    const otherStorePrincipal = {
      userId: 'user_erin',
      storeId: 'store_902',
      regionId: 'region_north',
      role: 'STORE_MANAGER' as const,
      departmentId: null,
    };

    await expect(
      fixture.activities.service.get(otherStorePrincipal, taskId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('publishes a status_changed event on a single PATCH transition', async () => {
    const taskId = await seedActivity(fixture);

    await fixture.activities.service.patch(
      fixture.principal('associateEarly'),
      taskId,
      { status: 'IN_PROGRESS' },
      'corr_patch',
    );

    const events = fixture.events('activities.task.status_changed');
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      taskId,
      fromStatus: 'TODO',
      toStatus: 'IN_PROGRESS',
      bulkOperationId: null,
    });
  });

  it('refuses a PATCH from an unrelated associate (BR-7)', async () => {
    const taskId = await seedActivity(fixture, { assigneeId: USERS.associateEarly.userId });

    await expect(
      fixture.activities.service.patch(
        fixture.principal('associateLate'),
        taskId,
        { status: 'DONE' },
        'corr_patch_bad',
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(fixture.events('activities.task.status_changed')).toHaveLength(0);
  });

  it('requires a note when a single PATCH sets BLOCKED (BR-3)', async () => {
    const taskId = await seedActivity(fixture);

    const error = (await fixture.activities.service
      .patch(fixture.principal('groceryLead'), taskId, { status: 'BLOCKED' }, 'corr_patch_block')
      .catch((caught: unknown) => caught)) as BusinessRuleError;

    expect(error.rule).toBe('BR-3');
  });

  it('lets the creator delete, and refuses an unrelated associate', async () => {
    const taskId = await seedActivity(fixture);

    await expect(
      fixture.activities.service.remove(fixture.principal('associateLate'), taskId, 'corr_del_bad'),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await fixture.activities.service.remove(fixture.principal('groceryLead'), taskId, 'corr_del');
    await expect(
      fixture.activities.service.get(fixture.principal('groceryLead'), taskId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('filters the list by programme and status', async () => {
    const plain = await seedActivity(fixture);
    await fixture.activities.service.patch(
      fixture.principal('groceryLead'),
      plain,
      { status: 'IN_PROGRESS' },
      'corr_filter',
    );
    await seedActivity(fixture, { title: 'Second activity' });

    const inProgress = await fixture.activities.service.list(fixture.principal('groceryLead'), {
      status: 'IN_PROGRESS',
    });
    expect(inProgress.map((activity) => activity.taskId)).toEqual([plain]);

    const all = await fixture.activities.service.list(fixture.principal('groceryLead'));
    expect(all).toHaveLength(2);
  });
});
