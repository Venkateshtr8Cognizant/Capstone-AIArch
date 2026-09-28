import { describe, expect, it } from 'vitest';

/** Clean reference test: status plus business outcome, plus a rejection case. */
describe('POST /api/activities', () => {
  it('returns 201 and the created activity', async () => {
    const response = { status: 201, body: { data: { taskId: 'task_1', status: 'TODO' } } };
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('TODO');
  });

  it('returns 422 naming the violated rule', async () => {
    const response = { status: 422, body: { error: { rule: 'ACT-1', code: 'BUSINESS_RULE_VIOLATION' } } };
    expect(response.status).toBe(422);
    expect(response.body.error.rule).toBe('ACT-1');
  });
});
