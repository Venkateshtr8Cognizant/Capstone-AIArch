// FIXTURE — FAILURE MODE F3 (deliberate violations, do not copy).
//
// This file is green, fast, and gives full line coverage of the endpoint.
// It also proves nothing: it never checks what the endpoint DID. Coverage
// tooling cannot detect this, which is exactly why TQ-2 and TQ-3 exist.
import request from 'supertest';
import { describe, expect, it } from 'vitest';

declare const app: unknown;

describe('PATCH /api/activities/bulk-status', () => {
  it('works', async () => {
    // TQ-2: status only — no assertion on updated, failed, or the event.
    const response = await request(app).patch('/api/activities/bulk-status').send({
      taskIds: ['task_1', 'task_2'],
      targetStatus: 'DONE',
    });
    expect(response.status).toBe(200);
  });

  it('handles bad input', async () => {
    // TQ-2 and TQ-3: a 422 with no idea which rule fired.
    const response = await request(app).patch('/api/activities/bulk-status').send({
      taskIds: [],
      targetStatus: 'DONE',
    });
    expect(response.status).toBe(422);
  });

  it('returns a response', async () => {
    // TQ-1 territory in spirit; TQ-2 in fact.
    const response = await request(app).get('/api/activities');
    expect(response.status).toBe(200);
  });
});
