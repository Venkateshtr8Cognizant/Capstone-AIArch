import { randomUUID } from 'node:crypto';
export class UuidIdGenerator {
    next(prefix) {
        return `${prefix}_${randomUUID()}`;
    }
}
/** Predictable ids (`task_0001`) for tests and the demonstration run. */
export class SequentialIdGenerator {
    counters = new Map();
    next(prefix) {
        const nextValue = (this.counters.get(prefix) ?? 0) + 1;
        this.counters.set(prefix, nextValue);
        return `${prefix}_${String(nextValue).padStart(4, '0')}`;
    }
}
//# sourceMappingURL=ids.js.map