export class SystemClock {
    now() {
        return new Date();
    }
    nowIso() {
        return this.now().toISOString();
    }
}
/** Deterministic clock for tests and for the harness demonstration run. */
export class FixedClock {
    current;
    constructor(iso = '2026-09-22T06:00:00.000Z') {
        this.current = new Date(iso);
    }
    now() {
        return new Date(this.current);
    }
    nowIso() {
        return this.current.toISOString();
    }
    advance(ms) {
        this.current = new Date(this.current.getTime() + ms);
    }
}
//# sourceMappingURL=clock.js.map