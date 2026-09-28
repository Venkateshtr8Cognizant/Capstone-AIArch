import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEPT_CHILLED,
  USERS,
  auth,
  buildFixture,
  seedActivity,
  type Fixture,
} from '../support/storeops-fixture.js';

/**
 * API tests for PATCH /api/activities/bulk-status (SPEC 3.4, feature 1).
 *
 * Harness rule (testing-standards skill, TQ-2/TQ-3): a status-code assertion
 * is never the only assertion. Every case also asserts the business outcome —
 * the rule that fired, the per-item failure code, the persisted state, or the
 * emitted event.
 */
describe('PATCH /api/activities/bulk-status', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await buildFixture();
  });

  it('returns 200, updates the batch, and emits one bulk event', async () => {
    const first = await seedActivity(fixture);
    const second = await seedActivity(fixture, { title: 'Clear the back-stock cage' });

    const response = await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .set(...auth('groceryLead'))
      .set('x-correlation-id', 'corr_api_1')
      .send({ taskIds: [first, second], targetStatus: 'DONE' });

    expect(response.status).toBe(200);
    expect(response.body.data.updatedCount).toBe(2);
    expect(response.body.data.failedCount).toBe(0);
    expect(response.body.data.updated.map((item: { status: string }) => item.status)).toEqual([
      'DONE',
      'DONE',
    ]);
    expect(response.headers['x-correlation-id']).toBe('corr_api_1');

    const events = fixture.events('activities.bulk_status.completed');
    expect(events).toHaveLength(1);
    expect(events[0]?.payload.updated).toHaveLength(2);
    expect(events[0]?.correlationId).toBe('corr_api_1');

    const listed = await request(fixture.app)
      .get('/api/activities?status=DONE')
      .set(...auth('groceryLead'));
    expect(listed.body.data).toHaveLength(2);
  });

  it('returns 200 with per-item failures when part of the batch is rejected', async () => {
    const mine = await seedActivity(fixture, { assigneeId: USERS.associateEarly.userId });
    const chilled = await seedActivity(fixture, {
      departmentId: DEPT_CHILLED,
      assigneeId: USERS.associateLate.userId,
      createdBy: 'chilledLead',
    });

    const response = await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .set(...auth('associateEarly'))
      .send({ taskIds: [mine, chilled, 'task_ghost'], targetStatus: 'DONE' });

    expect(response.status).toBe(200);
    expect(response.body.data.updatedCount).toBe(1);
    expect(response.body.data.updated[0].taskId).toBe(mine);
    expect(response.body.data.failed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: chilled, code: 'NOT_PERMITTED', rule: 'BR-7' }),
        expect.objectContaining({ taskId: 'task_ghost', code: 'ACTIVITY_NOT_FOUND', rule: 'BR-4' }),
      ]),
    );

    // The rejected activity is untouched in the store.
    const untouched = await request(fixture.app)
      .get(`/api/activities/${chilled}`)
      .set(...auth('chilledLead'));
    expect(untouched.body.data.status).toBe('TODO');
  });

  it('returns 422 naming the rule when no item could be updated (BR-9)', async () => {
    const response = await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .set(...auth('groceryLead'))
      .send({ taskIds: ['task_ghost_a', 'task_ghost_b'], targetStatus: 'DONE' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(response.body.error.rule).toBe('BR-9');
    expect(response.body.error.details.map((detail: { rule: string }) => detail.rule)).toEqual(
      expect.arrayContaining(['BR-9', 'BR-4']),
    );
    expect(fixture.events('activities.bulk_status.completed')).toHaveLength(0);
  });

  it('returns 422 when BLOCKED is requested without a note (BR-3)', async () => {
    const taskId = await seedActivity(fixture);

    const response = await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .set(...auth('groceryLead'))
      .send({ taskIds: [taskId], targetStatus: 'BLOCKED' });

    expect(response.status).toBe(422);
    expect(response.body.error.rule).toBe('BR-3');
    expect(response.body.error.details[0]).toMatchObject({ path: 'note', rule: 'BR-3' });

    const untouched = await request(fixture.app)
      .get(`/api/activities/${taskId}`)
      .set(...auth('groceryLead'));
    expect(untouched.body.data.status).toBe('TODO');
  });

  it('returns 422 with duplicate ids in the batch (BR-1)', async () => {
    const taskId = await seedActivity(fixture);

    const response = await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .set(...auth('groceryLead'))
      .send({ taskIds: [taskId, taskId], targetStatus: 'DONE' });

    expect(response.status).toBe(422);
    expect(response.body.error.rule).toBe('BR-1');
    expect(fixture.events('activities.bulk_status.completed')).toHaveLength(0);
  });

  it('returns 400 with field detail when the batch exceeds the schema ceiling (BR-1)', async () => {
    const response = await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .set(...auth('groceryLead'))
      .send({
        taskIds: Array.from({ length: 51 }, (_, index) => `task_${index}`),
        targetStatus: 'DONE',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details[0].path).toBe('taskIds');
  });

  it('returns 400 when the target status is not DONE or BLOCKED (BR-2)', async () => {
    const taskId = await seedActivity(fixture);

    const response = await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .set(...auth('groceryLead'))
      .send({ taskIds: [taskId], targetStatus: 'IN_PROGRESS' });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('targetStatus');
  });

  it('returns 401 without a bearer token and changes nothing', async () => {
    const taskId = await seedActivity(fixture);

    const response = await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .send({ taskIds: [taskId], targetStatus: 'DONE' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('NOT_AUTHENTICATED');
    expect(fixture.events('activities.bulk_status.completed')).toHaveLength(0);
  });

  it('refuses an activity from another store even for that store\'s manager (BR-5)', async () => {
    const taskId = await seedActivity(fixture);

    const response = await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .set('authorization', 'Bearer token-erin-other-store')
      .send({ taskIds: [taskId], targetStatus: 'DONE' });

    expect(response.status).toBe(422);
    // The id resolves, so the precise rejection is BR-5 (cross-store), not
    // BR-4 (not found); nothing succeeded, so BR-9 fails the whole request.
    expect(response.body.error.rule).toBe('BR-9');
    expect(response.body.error.details.map((detail: { rule: string }) => detail.rule)).toEqual(
      expect.arrayContaining(['BR-5']),
    );

    const untouched = await request(fixture.app)
      .get(`/api/activities/${taskId}`)
      .set(...auth('groceryLead'));
    expect(untouched.body.data.status).toBe('TODO');
  });

  it('raises a SHIFT_HANDOVER alert to the store manager through the event bus (BR-11)', async () => {
    const taskId = await seedActivity(fixture);

    await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .set(...auth('groceryLead'))
      .send({ taskIds: [taskId], targetStatus: 'DONE' })
      .expect(200);

    const alerts = await request(fixture.app)
      .get('/api/alerts')
      .set(...auth('storeManager'));

    expect(alerts.status).toBe(200);
    expect(alerts.body.data).toHaveLength(1);
    expect(alerts.body.data[0]).toMatchObject({
      type: 'SHIFT_HANDOVER',
      channel: 'IN_APP',
      status: 'PENDING',
    });
    expect(alerts.body.data[0].subject).toContain('1 activity(ies) set to DONE');
  });

  it('recomputes the store summary report through the event bus (BR-11)', async () => {
    const first = await seedActivity(fixture);
    await seedActivity(fixture, { title: 'Second activity' });

    await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .set(...auth('groceryLead'))
      .send({ taskIds: [first], targetStatus: 'DONE' })
      .expect(200);

    const report = await fixture.reports.service.findLatest('STORE_SUMMARY', 'store_401');
    expect(report?.status).toBe('READY');
    expect(report?.metrics).toMatchObject({
      totalActivities: 2,
      completedActivities: 1,
      completionRate: 0.5,
    });
  });
});
