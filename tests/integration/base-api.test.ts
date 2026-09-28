import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEPT_GROCERY,
  USERS,
  auth,
  buildFixture,
  seedActivity,
  type Fixture,
} from '../support/storeops-fixture.js';

/**
 * The nine base endpoints of SPEC 3.6, plus the documented programme-close
 * extension. Each case asserts the business outcome alongside the status.
 */
describe('StoreOps base API surface', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await buildFixture();
  });

  it('GET /health reports ok without authentication', async () => {
    const response = await request(fixture.app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
  });

  it('rejects an unknown bearer token with a typed 401', async () => {
    const response = await request(fixture.app)
      .get('/api/activities')
      .set('authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('rejects a malformed Authorization header with a typed 401', async () => {
    const response = await request(fixture.app)
      .get('/api/activities')
      .set('authorization', 'Token abc');

    expect(response.status).toBe(401);
    expect(response.body.error.message).toContain('Bearer');
  });

  it('POST /api/activities creates an activity in TODO and returns it', async () => {
    const response = await request(fixture.app)
      .post('/api/activities')
      .set(...auth('groceryLead'))
      .send({
        title: 'Reset the promotional end cap',
        priority: 'HIGH',
        category: 'PLANOGRAM',
        departmentId: DEPT_GROCERY,
        assigneeId: USERS.associateEarly.userId,
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      status: 'TODO',
      priority: 'HIGH',
      category: 'PLANOGRAM',
      assigneeId: USERS.associateEarly.userId,
      storeId: 'store_401',
    });
    expect(fixture.events('activities.task.created')).toHaveLength(1);
  });

  it('POST /api/activities rejects an unknown category with field detail', async () => {
    const response = await request(fixture.app)
      .post('/api/activities')
      .set(...auth('groceryLead'))
      .send({ title: 'Something odd', priority: 'HIGH', category: 'TIDYING' });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('category');
    expect(fixture.events('activities.task.created')).toHaveLength(0);
  });

  it('GET /api/activities lists only the authenticated store and supports filters', async () => {
    const first = await seedActivity(fixture);
    await seedActivity(fixture, { title: 'Second activity' });
    await request(fixture.app)
      .patch(`/api/activities/${first}`)
      .set(...auth('groceryLead'))
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    const all = await request(fixture.app)
      .get('/api/activities')
      .set(...auth('groceryLead'));
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(2);

    const filtered = await request(fixture.app)
      .get('/api/activities?status=IN_PROGRESS')
      .set(...auth('groceryLead'));
    expect(filtered.body.data.map((item: { taskId: string }) => item.taskId)).toEqual([first]);
  });

  it('GET /api/activities/:id returns 404 for an activity in another store', async () => {
    const taskId = await seedActivity(fixture);

    const response = await request(fixture.app)
      .get(`/api/activities/${taskId}`)
      .set('authorization', 'Bearer token-erin-other-store');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ACTIVITY_NOT_FOUND');
  });

  it('PATCH /api/activities/:id changes status and emits status_changed', async () => {
    const taskId = await seedActivity(fixture);

    const response = await request(fixture.app)
      .patch(`/api/activities/${taskId}`)
      .set(...auth('associateEarly'))
      .send({ status: 'IN_PROGRESS' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('IN_PROGRESS');
    expect(fixture.events('activities.task.status_changed')[0]?.payload).toMatchObject({
      fromStatus: 'TODO',
      toStatus: 'IN_PROGRESS',
    });
  });

  it('PATCH /api/activities/:id refuses an illegal transition with 409', async () => {
    const taskId = await seedActivity(fixture);
    await request(fixture.app)
      .patch(`/api/activities/${taskId}`)
      .set(...auth('groceryLead'))
      .send({ status: 'DONE' })
      .expect(200);

    const response = await request(fixture.app)
      .patch(`/api/activities/${taskId}`)
      .set(...auth('groceryLead'))
      .send({ status: 'IN_PROGRESS' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('STATE_CONFLICT');
  });

  it('PATCH /api/activities/:id refuses an empty body', async () => {
    const taskId = await seedActivity(fixture);

    const response = await request(fixture.app)
      .patch(`/api/activities/${taskId}`)
      .set(...auth('groceryLead'))
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('DELETE /api/activities/:id allows the creator and refuses an associate', async () => {
    const taskId = await seedActivity(fixture);

    const refused = await request(fixture.app)
      .delete(`/api/activities/${taskId}`)
      .set(...auth('associateLate'));
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('NOT_AUTHORIZED');

    const deleted = await request(fixture.app)
      .delete(`/api/activities/${taskId}`)
      .set(...auth('groceryLead'));
    expect(deleted.status).toBe(204);

    const gone = await request(fixture.app)
      .get(`/api/activities/${taskId}`)
      .set(...auth('groceryLead'));
    expect(gone.body.error.code).toBe('ACTIVITY_NOT_FOUND');
  });

  it('POST /api/programmes creates a programme in PLANNING with the creator as a member', async () => {
    const response = await request(fixture.app)
      .post('/api/programmes')
      .set(...auth('storeManager'))
      .send({ name: 'Autumn planogram reset', description: 'Seasonal layout change' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ status: 'PLANNING', storeId: 'store_401' });
    expect(response.body.data.members).toEqual([
      expect.objectContaining({ userId: USERS.storeManager.userId, role: 'STORE_MANAGER' }),
    ]);
  });

  it('POST /api/programmes refuses an associate with 403', async () => {
    const response = await request(fixture.app)
      .post('/api/programmes')
      .set(...auth('associateEarly'))
      .send({ name: 'Unauthorised programme' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('NOT_AUTHORIZED');
  });

  it('GET /api/programmes lists programmes for the authenticated store only', async () => {
    await request(fixture.app)
      .post('/api/programmes')
      .set(...auth('storeManager'))
      .send({ name: 'Store 401 programme' })
      .expect(201);

    const mine = await request(fixture.app)
      .get('/api/programmes')
      .set(...auth('groceryLead'));
    expect(mine.body.data).toHaveLength(1);

    const other = await request(fixture.app)
      .get('/api/programmes')
      .set('authorization', 'Bearer token-erin-other-store');
    expect(other.body.data).toHaveLength(0);
  });

  it('POST /api/programmes/:id/members adds a member and emits member.added', async () => {
    const created = await request(fixture.app)
      .post('/api/programmes')
      .set(...auth('groceryLead'))
      .send({ name: 'Compliance audit round' })
      .expect(201);

    const response = await request(fixture.app)
      .post(`/api/programmes/${created.body.data.programmeId}/members`)
      .set(...auth('groceryLead'))
      .send({ userId: USERS.associateEarly.userId, role: 'ASSOCIATE' });

    expect(response.status).toBe(201);
    expect(response.body.data.members).toHaveLength(2);
    expect(fixture.events('programmes.member.added')[0]?.payload).toMatchObject({
      userId: USERS.associateEarly.userId,
      role: 'ASSOCIATE',
    });
  });

  it('POST /api/programmes/:id/members refuses a colleague from another store (PRG-1)', async () => {
    const created = await request(fixture.app)
      .post('/api/programmes')
      .set(...auth('storeManager'))
      .send({ name: 'Cross-store attempt' })
      .expect(201);

    const response = await request(fixture.app)
      .post(`/api/programmes/${created.body.data.programmeId}/members`)
      .set(...auth('storeManager'))
      .send({ userId: 'user_erin', role: 'ASSOCIATE' });

    expect(response.status).toBe(422);
    expect(response.body.error.rule).toBe('PRG-1');
    expect(fixture.events('programmes.member.added')).toHaveLength(0);
  });

  it('POST /api/programmes/:id/members activates a planning programme when a manager joins', async () => {
    const created = await request(fixture.app)
      .post('/api/programmes')
      .set(...auth('groceryLead'))
      .send({ name: 'Needs a manager' })
      .expect(201);
    expect(created.body.data.status).toBe('PLANNING');

    const response = await request(fixture.app)
      .post(`/api/programmes/${created.body.data.programmeId}/members`)
      .set(...auth('groceryLead'))
      .send({ userId: USERS.storeManager.userId, role: 'STORE_MANAGER' });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('ACTIVE');
  });

  it('GET /api/alerts returns only the authenticated user\'s notifications', async () => {
    const taskId = await seedActivity(fixture, { priority: 'CRITICAL' });
    await request(fixture.app)
      .patch(`/api/activities/${taskId}`)
      .set(...auth('groceryLead'))
      .send({ status: 'BLOCKED', note: 'Pallet jack broken' })
      .expect(200);

    // The escalation targets the grocery department lead.
    const lead = await request(fixture.app)
      .get('/api/alerts')
      .set(...auth('groceryLead'));
    expect(lead.status).toBe(200);
    expect(lead.body.data).toEqual([
      expect.objectContaining({ type: 'ESCALATION', channel: 'EMAIL' }),
    ]);

    const unrelated = await request(fixture.app)
      .get('/api/alerts')
      .set(...auth('associateLate'));
    expect(unrelated.body.data).toHaveLength(0);
  });

  it('POST /api/programmes/:id/close triggers a STORE_SUMMARY recompute via the bus', async () => {
    const created = await request(fixture.app)
      .post('/api/programmes')
      .set(...auth('storeManager'))
      .send({ name: 'Closing programme' })
      .expect(201);
    const programmeId = created.body.data.programmeId;

    await seedActivity(fixture, { programmeId, title: 'Programme activity' });

    const response = await request(fixture.app)
      .post(`/api/programmes/${programmeId}/close`)
      .set(...auth('storeManager'));

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CLOSED');
    expect(fixture.events('programmes.programme.closed')[0]?.payload.openTaskCountAtClose).toBe(1);

    const report = await fixture.reports.service.findLatest('STORE_SUMMARY', 'store_401');
    expect(report?.status).toBe('READY');
    expect(report?.metrics?.totalActivities).toBe(1);
  });

  it('POST /api/programmes/:id/close refuses a department lead with 403', async () => {
    const created = await request(fixture.app)
      .post('/api/programmes')
      .set(...auth('groceryLead'))
      .send({ name: 'Lead-owned programme' })
      .expect(201);

    const response = await request(fixture.app)
      .post(`/api/programmes/${created.body.data.programmeId}/close`)
      .set(...auth('groceryLead'));

    expect(response.status).toBe(403);
    expect(fixture.events('programmes.programme.closed')).toHaveLength(0);
  });

  it('returns a typed 404 for an unrouted path', async () => {
    const response = await request(fixture.app)
      .get('/api/not-a-thing')
      .set(...auth('groceryLead'));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('echoes the caller\'s correlation id on error responses', async () => {
    const response = await request(fixture.app)
      .get('/api/activities/task_missing')
      .set(...auth('groceryLead'))
      .set('x-correlation-id', 'corr_trace_me');

    expect(response.status).toBe(404);
    expect(response.body.error.correlationId).toBe('corr_trace_me');
  });
});
