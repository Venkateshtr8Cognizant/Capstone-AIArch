import { randomUUID } from 'node:crypto';
import { AuthenticationError, InternalError, ValidationError, isAppError, } from '../errors/index.js';
/** Stamps every request with a correlation id and echoes it in the response. */
export function correlationId() {
    return (req, res, next) => {
        const incoming = req.header('x-correlation-id');
        const id = incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
        req.correlationId = id;
        res.setHeader('x-correlation-id', id);
        next();
    };
}
/**
 * Authenticates the request from `Authorization: Bearer <token>`.
 *
 * staff is the auth-only module (SPEC 3.6): it has no CRUD surface, and this
 * is the single place a token becomes a principal.
 */
export function authenticate(resolve) {
    return (req, _res, next) => {
        const header = req.header('authorization') ?? '';
        const match = /^Bearer\s+(.+)$/i.exec(header.trim());
        if (!match?.[1]) {
            next(new AuthenticationError('Authorization header must be "Bearer <token>"', {
                correlationId: req.correlationId,
            }));
            return;
        }
        resolve(match[1])
            .then((principal) => {
            if (!principal) {
                next(new AuthenticationError('Token is invalid or expired', {
                    correlationId: req.correlationId,
                }));
                return;
            }
            req.principal = principal;
            next();
        })
            .catch(next);
    };
}
/** Narrows `req.principal` for route handlers that run behind `authenticate`. */
export function principalOf(req) {
    if (!req.principal) {
        throw new AuthenticationError('Authentication required', { correlationId: req.correlationId });
    }
    return req.principal;
}
/**
 * Wraps an async route handler so a rejected promise reaches the error
 * middleware instead of hanging the request.
 */
export function route(handler) {
    return (req, res, next) => {
        handler(req, res).catch(next);
    };
}
/** Parses a request body with a zod schema, raising ValidationError on failure. */
export function parseBody(schema, body, correlationIdValue) {
    const result = schema.safeParse(body);
    if (result.success) {
        return result.data;
    }
    throw new ValidationError('Request body failed validation', {
        details: zodDetails(result.error),
        correlationId: correlationIdValue,
    });
}
/** Parses query parameters with a zod schema. */
export function parseQuery(schema, query, correlationIdValue) {
    const result = schema.safeParse(query);
    if (result.success) {
        return result.data;
    }
    throw new ValidationError('Query parameters failed validation', {
        details: zodDetails(result.error),
        correlationId: correlationIdValue,
    });
}
/**
 * Reads a required path parameter. Express types path params as possibly
 * undefined under `noUncheckedIndexedAccess`; this narrows the type and
 * raises the project's typed ValidationError rather than casting.
 */
export function pathParam(req, name) {
    const value = req.params[name];
    if (typeof value !== 'string' || value.length === 0) {
        throw new ValidationError(`Path parameter '${name}' is required`, {
            details: [{ path: name, message: 'required path parameter' }],
            correlationId: req.correlationId,
        });
    }
    return value;
}
function zodDetails(error) {
    return error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join('.') : '(body)',
        message: issue.message,
    }));
}
/**
 * Terminal error middleware: the single place where an error becomes an HTTP
 * response. Because the whole codebase throws AppError subclasses, this
 * function needs no per-module special cases — which is exactly why raw
 * `throw new Error()` is a blocking gate finding.
 */
export function errorHandler(logger) {
    return (error, req, res, _next) => {
        const appError = isAppError(error)
            ? error
            : new InternalError('Unhandled error', { cause: error, correlationId: req.correlationId });
        const body = appError.toJSON();
        if (!body.correlationId && req.correlationId) {
            body.correlationId = req.correlationId;
        }
        const logFields = {
            code: appError.code,
            status: appError.statusCode,
            method: req.method,
            path: req.originalUrl,
            userId: req.principal?.userId ?? null,
            correlationId: body.correlationId,
        };
        if (appError.isOperational) {
            logger.warn('request.rejected', logFields);
        }
        else {
            logger.error('request.failed', {
                ...logFields,
                message: appError.message,
                cause: error instanceof Error ? error.stack : String(error),
            });
        }
        res.status(appError.statusCode).json({ error: body });
    };
}
/** 404 handler for unrouted paths. */
export function notFoundHandler() {
    return (req, res) => {
        res.status(404).json({
            error: {
                code: 'ROUTE_NOT_FOUND',
                message: `No route matches ${req.method} ${req.originalUrl}`,
                details: [],
                ...(req.correlationId ? { correlationId: req.correlationId } : {}),
            },
        });
    };
}
//# sourceMappingURL=middleware.js.map