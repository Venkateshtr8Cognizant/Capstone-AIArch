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
export class AppError extends Error {
    /**
     * True when the error is an expected outcome of a valid request (client
     * error, business rule rejection). False signals a defect or dependency
     * failure, and is what alerting pages on.
     */
    isOperational = true;
    details;
    /** Correlation id of the request that produced the error, when available. */
    correlationId;
    constructor(message, options = {}) {
        super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
        this.name = new.target.name;
        this.details = options.details ?? [];
        this.correlationId = options.correlationId;
        Error.captureStackTrace?.(this, new.target);
    }
    /** Wire format produced by the error middleware. */
    toJSON() {
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
    code = 'VALIDATION_FAILED';
    statusCode = 400;
    constructor(message, options) {
        super(message, options);
    }
}
/** No valid credentials were presented. */
export class AuthenticationError extends AppError {
    code = 'NOT_AUTHENTICATED';
    statusCode = 401;
    constructor(message = 'Authentication required', options) {
        super(message, options);
    }
}
/** Credentials are valid but the principal may not perform the action. */
export class AuthorizationError extends AppError {
    code = 'NOT_AUTHORIZED';
    statusCode = 403;
    constructor(message, options) {
        super(message, options);
    }
}
/** A referenced entity does not exist. */
export class NotFoundError extends AppError {
    code;
    statusCode = 404;
    constructor(resource, id, options) {
        super(`${resource} '${id}' was not found`, options);
        this.code = `${toScreamingSnake(resource)}_NOT_FOUND`;
    }
}
/** The request conflicts with the current state of the entity. */
export class ConflictError extends AppError {
    code = 'STATE_CONFLICT';
    statusCode = 409;
    constructor(message, options) {
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
    code = 'BUSINESS_RULE_VIOLATION';
    statusCode = 422;
    rule;
    constructor(rule, message, options) {
        super(message, options);
        this.rule = rule;
    }
    toJSON() {
        return { ...super.toJSON(), rule: this.rule };
    }
}
/** An unexpected failure. Non-operational: this is what alerting pages on. */
export class InternalError extends AppError {
    code = 'INTERNAL_ERROR';
    statusCode = 500;
    isOperational = false;
    constructor(message = 'An unexpected error occurred', options) {
        super(message, options);
    }
}
function toScreamingSnake(value) {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toUpperCase();
}
export function isAppError(error) {
    return error instanceof AppError;
}
//# sourceMappingURL=app-error.js.map