/**
 * StoreOps typed error hierarchy.
 *
 * STANDARD (SPEC 3.3): every error raised in a service or route MUST be an
 * AppError subclass carrying `code`, `message` and `statusCode`. Raw
 * `throw new Error(...)` is rejected by the harness gate
 * (.harness/checks/check-errors.mjs) because a raw error loses the
 * machine-readable code, the HTTP mapping and the operational flag that the
 * error middleware, the API contract and the on-call runbooks depend on.
 */

export type ErrorDetail = {
  /** Dot-path of the offending field or entity, e.g. `ids[3]`. */
  path: string;
  /** Human-readable explanation for the API consumer. */
  message: string;
  /** Business rule identifier when the detail comes from a rule check. */
  rule?: string;
};

export abstract class AppError extends Error {
  /** Stable, machine-readable error code, e.g. `ACTIVITY_NOT_FOUND`. */
  abstract readonly code: string;
  /** HTTP status the error middleware maps this error to. */
  abstract readonly statusCode: number;
  /**
   * True when the error is an expected outcome of a valid request (client
   * error, business rule rejection). False signals a defect or dependency
   * failure, and is what alerting pages on.
   */
  readonly isOperational: boolean = true;
  readonly details: ErrorDetail[];
  /** Correlation id of the request that produced the error, when available. */
  readonly correlationId?: string;

  protected constructor(
    message: string,
    options: { details?: ErrorDetail[]; correlationId?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.details = options.details ?? [];
    this.correlationId = options.correlationId;
    Error.captureStackTrace?.(this, new.target);
  }

  /** Wire format produced by the error middleware. */
  toJSON(): {
    code: string;
    message: string;
    details: ErrorDetail[];
    correlationId?: string;
  } {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      ...(this.correlationId ? { correlationId: this.correlationId } : {}),
    };
  }
}

/** Request payload failed schema or format validation. */
export class ValidationError extends AppError {
  readonly code = 'VALIDATION_FAILED';
  readonly statusCode = 400;

  constructor(message: string, options?: { details?: ErrorDetail[]; correlationId?: string }) {
    super(message, options);
  }
}

/** No valid credentials were presented. */
export class AuthenticationError extends AppError {
  readonly code = 'NOT_AUTHENTICATED';
  readonly statusCode = 401;

  constructor(message = 'Authentication required', options?: { correlationId?: string }) {
    super(message, options);
  }
}

/** Credentials are valid but the principal may not perform the action. */
export class AuthorizationError extends AppError {
  readonly code = 'NOT_AUTHORIZED';
  readonly statusCode = 403;

  constructor(message: string, options?: { details?: ErrorDetail[]; correlationId?: string }) {
    super(message, options);
  }
}

/** A referenced entity does not exist. */
export class NotFoundError extends AppError {
  readonly code: string;
  readonly statusCode = 404;

  constructor(
    resource: string,
    id: string,
    options?: { details?: ErrorDetail[]; correlationId?: string },
  ) {
    super(`${resource} '${id}' was not found`, options);
    this.code = `${toScreamingSnake(resource)}_NOT_FOUND`;
  }
}

/** The request conflicts with the current state of the entity. */
export class ConflictError extends AppError {
  readonly code = 'STATE_CONFLICT';
  readonly statusCode = 409;

  constructor(message: string, options?: { details?: ErrorDetail[]; correlationId?: string }) {
    super(message, options);
  }
}

/**
 * A documented business rule rejected the request.
 *
 * `rule` carries the rule identifier from the sprint contract (e.g. `BR-3`).
 * This field is what makes business-rule test assertions possible: tests
 * assert on the rule that fired, not only on the HTTP status code.
 */
export class BusinessRuleError extends AppError {
  readonly code = 'BUSINESS_RULE_VIOLATION';
  readonly statusCode = 422;
  readonly rule: string;

  constructor(
    rule: string,
    message: string,
    options?: { details?: ErrorDetail[]; correlationId?: string },
  ) {
    super(message, options);
    this.rule = rule;
  }

  override toJSON() {
    return { ...super.toJSON(), rule: this.rule };
  }
}

/** An unexpected failure. Non-operational: this is what alerting pages on. */
export class InternalError extends AppError {
  readonly code = 'INTERNAL_ERROR';
  readonly statusCode = 500;
  override readonly isOperational = false;

  constructor(
    message = 'An unexpected error occurred',
    options?: { cause?: unknown; correlationId?: string },
  ) {
    super(message, options);
  }
}

function toScreamingSnake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
