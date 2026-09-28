/** Injected time source. Nothing in StoreOps calls `new Date()` directly. */
export interface Clock {
  now(): Date;
  nowIso(): string;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowIso(): string {
    return this.now().toISOString();
  }
}

/** Deterministic clock for tests and for the harness demonstration run. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(iso = '2026-09-22T06:00:00.000Z') {
    this.current = new Date(iso);
  }

  now(): Date {
    return new Date(this.current);
  }

  nowIso(): string {
    return this.current.toISOString();
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
