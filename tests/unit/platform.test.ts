import { describe, expect, it } from 'vitest';
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
  isAppError,
} from '../../src/platform/errors/index.js';
import { InMemoryEventBus } from '../../src/platform/events/event-bus.js';
import { FixedClock } from '../../src/platform/support/clock.js';
import { SequentialIdGenerator } from '../../src/platform/support/ids.js';
import { RecordingLogger } from '../../src/platform/support/logger.js';
import { summarise } from '../../src/modules/reports/reports.service.js';

describe('AppError hierarchy', () => {
  it('maps each error class to its documented code and status', () => {
    expect([new ValidationError('bad').code, new ValidationError('bad').statusCode]).toEqual([
      'VALIDATION_FAILED',
      400,
    ]);
    expect(new AuthenticationError().statusCode).toBe(401);
    expect(new AuthorizationError('nope').statusCode).toBe(403);
    expect(new NotFoundError('Activity', 'task_1').statusCode).toBe(404);
    expect(new ConflictError('nope').statusCode).toBe(409);
    expect(new BusinessRuleError('BR-5', 'nope').statusCode).toBe(422);
    expect(new InternalError().statusCode).toBe(500);
  });

  it('derives a machine-readable code from the resource name', () => {
    expect(new NotFoundError('Activity', 'task_1').code).toBe('ACTIVITY_NOT_FOUND');
    expect(new NotFoundError('Programme', 'prog_1').code).toBe('PROGRAMME_NOT_FOUND');
    expect(new NotFoundError('StockLevel', 'x').code).toBe('STOCK_LEVEL_NOT_FOUND');
  });

  it('marks client and business errors operational, internal errors not', () => {
    expect(new BusinessRuleError('BR-1', 'nope').isOperational).toBe(true);
    expect(new NotFoundError('Activity', 'task_1').isOperational).toBe(true);
    expect(new InternalError().isOperational).toBe(false);
  });

  it('serialises the rule id so clients and tests can branch on it', () => {
    const error = new BusinessRuleError('BR-6', 'Activity is DONE', {
      details: [{ path: 'taskIds.task_2', message: 'already DONE', rule: 'BR-6' }],
      correlationId: 'corr_1',
    });

    expect(error.toJSON()).toEqual({
      code: 'BUSINESS_RULE_VIOLATION',
      message: 'Activity is DONE',
      details: [{ path: 'taskIds.task_2', message: 'already DONE', rule: 'BR-6' }],
      correlationId: 'corr_1',
      rule: 'BR-6',
    });
  });

  it('identifies AppError instances and rejects raw errors', () => {
    expect(isAppError(new ConflictError('x'))).toBe(true);
    expect(isAppError(new Error('raw'))).toBe(false);
    expect(new ConflictError('x')).toBeInstanceOf(AppError);
    expect(new BusinessRuleError('BR-1', 'x').name).toBe('BusinessRuleError');
  });
});

describe('InMemoryEventBus', () => {
  const draft = {
    type: 'programmes.member.added' as const,
    actor: { type: 'system' as const, id: 'test' },
    correlationId: 'corr_bus',
    payload: {
      programmeId: 'prog_0001',
      storeId: 'store_401',
      userId: 'user_alice',
      role: 'ASSOCIATE' as const,
    },
  };

  function makeBus() {
    const logger = new RecordingLogger();
    const bus = new InMemoryEventBus({
      clock: new FixedClock('2026-09-22T08:00:00.000Z'),
      ids: new SequentialIdGenerator(),
      logger,
    });
    return { bus, logger };
  }

  it('stamps the envelope and delivers to subscribers in registration order', async () => {
    const { bus } = makeBus();
    const seen: string[] = [];
    bus.subscribe('programmes.member.added', 'first', () => void seen.push('first'));
    bus.subscribe('programmes.member.added', 'second', () => void seen.push('second'));

    const [event] = await bus.publish([draft]);

    expect(event?.eventId).toBe('evt_0001');
    expect(event?.occurredAt).toBe('2026-09-22T08:00:00.000Z');
    expect(event?.version).toBe(1);
    expect(event?.correlationId).toBe('corr_bus');
    expect(seen).toEqual(['first', 'second']);
  });

  it('isolates a failing subscriber: the publisher succeeds and the event is dead-lettered', async () => {
    const { bus, logger } = makeBus();
    bus.subscribe('programmes.member.added', 'exploding', () => {
      throw new InternalError('subscriber blew up');
    });
    let healthyRan = false;
    bus.subscribe('programmes.member.added', 'healthy', () => {
      healthyRan = true;
    });

    await expect(bus.publish([draft])).resolves.toHaveLength(1);

    expect(healthyRan).toBe(true);
    expect(bus.deadLettered()).toHaveLength(1);
    expect(bus.deadLettered()[0]?.subscriberName).toBe('exploding');
    expect(logger.has('event.subscriber_failed')).toBe(true);
  });

  it('does not deliver an event to subscribers of another type', async () => {
    const { bus } = makeBus();
    let called = false;
    bus.subscribe('activities.task.created', 'wrong-type', () => {
      called = true;
    });
    await bus.publish([draft]);
    expect(called).toBe(false);
    expect(bus.published('programmes.member.added')).toHaveLength(1);
  });
});

describe('reports.summarise', () => {
  const now = new Date('2026-09-22T13:00:00.000Z');

  it('counts completion, blocks and overdue work by category', () => {
    const metrics = summarise(
      [
        { taskId: 'task_1', status: 'DONE', category: 'RESTOCKING', dueAt: null },
        { taskId: 'task_2', status: 'BLOCKED', category: 'PLANOGRAM', dueAt: '2026-09-22T09:00:00.000Z' },
        { taskId: 'task_3', status: 'TODO', category: 'AUDIT', dueAt: '2026-09-22T11:00:00.000Z' },
        { taskId: 'task_4', status: 'TODO', category: 'AUDIT', dueAt: '2026-09-23T11:00:00.000Z' },
      ],
      now,
    );

    expect(metrics.totalActivities).toBe(4);
    expect(metrics.completedActivities).toBe(1);
    expect(metrics.blockedActivities).toBe(1);
    expect(metrics.completionRate).toBe(0.25);
    expect(metrics.blockedTaskIds).toEqual(['task_2']);
    expect(metrics.overdueByCategory).toMatchObject({ PLANOGRAM: 1, AUDIT: 1, RESTOCKING: 0 });
  });

  it('never counts a DONE activity as overdue', () => {
    const metrics = summarise(
      [{ taskId: 'task_1', status: 'DONE', category: 'COMPLIANCE', dueAt: '2026-09-01T00:00:00.000Z' }],
      now,
    );

    expect(metrics.overdueByCategory.COMPLIANCE).toBe(0);
    expect(metrics.completionRate).toBe(1);
  });

  it('reports a zero completion rate for an empty store rather than dividing by zero', () => {
    const metrics = summarise([], now);
    expect(metrics.completionRate).toBe(0);
    expect(metrics.totalActivities).toBe(0);
  });
});
