// REJECTED ITERATION 1 — preserved as evidence. Do not copy.
//
// These three tests were green. They gave full line coverage of the handler.
// They are also completely blind to every defect in the implementation: the
// missing event, the missing audit entry, the hardcoded alert recipient, and
// the fact that a rejected item's reason is now untyped prose.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildFixture, auth, seedActivity } from '../support/storeops-fixture.js';

describe('PATCH /api/activities/bulk-status', () => {
  it('updates activities in bulk', async () => {
    const fixture = await buildFixture();
    const first = await seedActivity(fixture);
    const second = await seedActivity(fixture);

    const response = await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .set(...auth('groceryLead'))
      .send({ taskIds: [first, second], targetStatus: 'DONE' });

    // ❌ F3 / TQ-2 — nothing about what was updated, whether the event fired,
    // or whether the alert reached anyone.
    expect(response.status).toBe(200);
  });

  it('rejects a blocked update with no note', async () => {
    const fixture = await buildFixture();
    const taskId = await seedActivity(fixture);

    const response = await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .set(...auth('groceryLead'))
      .send({ taskIds: [taskId], targetStatus: 'BLOCKED' });

    // ❌ F3 / TQ-2 / TQ-3 — a 422 with no idea which rule produced it.
    expect(response.status).toBe(422);
  });

  it('requires authentication', async () => {
    const fixture = await buildFixture();

    const response = await request(fixture.app)
      .patch('/api/activities/bulk-status')
      .send({ taskIds: ['task_0001'], targetStatus: 'DONE' });

    expect(response.status).toBe(401);
  });
});
