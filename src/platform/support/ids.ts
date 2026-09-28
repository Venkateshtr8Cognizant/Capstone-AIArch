import { randomUUID } from 'node:crypto';

/** Injected id source, so generated ids are deterministic under test. */
export interface IdGenerator {
  next(prefix: string): string;
}

export class UuidIdGenerator implements IdGenerator {
  next(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }
}

/** Predictable ids (`task_0001`) for tests and the demonstration run. */
export class SequentialIdGenerator implements IdGenerator {
  private readonly counters = new Map<string, number>();

  next(prefix: string): string {
    const nextValue = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, nextValue);
    return `${prefix}_${String(nextValue).padStart(4, '0')}`;
  }
}
