export class JsonLogger {
    sink;
    constructor(sink = (line) => process.stdout.write(`${line}\n`)) {
        this.sink = sink;
    }
    info(event, fields) {
        this.write('info', event, fields);
    }
    warn(event, fields) {
        this.write('warn', event, fields);
    }
    error(event, fields) {
        this.write('error', event, fields);
    }
    write(level, event, fields) {
        this.sink(JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields }));
    }
}
/** Captures log lines instead of writing them; used by tests. */
export class RecordingLogger {
    lines = [];
    info(event, fields) {
        this.lines.push({ level: 'info', event, fields });
    }
    warn(event, fields) {
        this.lines.push({ level: 'warn', event, fields });
    }
    error(event, fields) {
        this.lines.push({ level: 'error', event, fields });
    }
    has(event) {
        return this.lines.some((line) => line.event === event);
    }
}
//# sourceMappingURL=logger.js.map