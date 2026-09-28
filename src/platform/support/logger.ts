export type LogFields = Record<string, unknown>;

/** Structured logging port. StoreOps never calls `console.*` in `src/`. */
export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export class JsonLogger implements Logger {
  constructor(
    private readonly sink: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
  ) {}

  info(event: string, fields?: LogFields): void {
    this.write('info', event, fields);
  }

  warn(event: string, fields?: LogFields): void {
    this.write('warn', event, fields);
  }

  error(event: string, fields?: LogFields): void {
    this.write('error', event, fields);
  }

  private write(level: string, event: string, fields?: LogFields): void {
    this.sink(JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields }));
  }
}

/** Captures log lines instead of writing them; used by tests. */
export class RecordingLogger implements Logger {
  readonly lines: Array<{ level: string; event: string; fields?: LogFields }> = [];

  info(event: string, fields?: LogFields): void {
    this.lines.push({ level: 'info', event, fields });
  }

  warn(event: string, fields?: LogFields): void {
    this.lines.push({ level: 'warn', event, fields });
  }

  error(event: string, fields?: LogFields): void {
    this.lines.push({ level: 'error', event, fields });
  }

  has(event: string): boolean {
    return this.lines.some((line) => line.event === event);
  }
}
