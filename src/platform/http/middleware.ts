import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { ZodError, ZodSchema } from 'zod';
import type { Principal } from '../../contracts/identity.js';
import {
  AppError,
  AuthenticationError,
  InternalError,
  ValidationError,
  isAppError,
} from '../errors/index.js';
import type { Logger } from '../support/logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    correlationId?: string;
    principal?: Principal;
  }
}

/**
 * Resolves a bearer token to a principal. Implemented by the staff module
 * and injected at the composition root, so the platform layer stays free of
 * module dependencies (harness rule MB-2).
 */
export type PrincipalResolver = (token: string) => Promise<Principal | null>;

/** Stamps every request with a correlation id and echoes it in the response. */
export function correlationId(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
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
export function authenticate(resolve: PrincipalResolver): RequestHandler {
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
export function principalOf(req: Request): Principal {
  if (!req.principal) {
    throw new AuthenticationError('Authentication required', { correlationId: req.correlationId });
  }
  return req.principal;
}

/**
 * Wraps an async route handler so a rejected promise reaches the error
 * middleware instead of hanging the request.
 */
export function route(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

/** Parses a request body with a zod schema, raising ValidationError on failure. */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown, correlationIdValue?: string): T {
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
export function parseQuery<T>(schema: ZodSchema<T>, query: unknown, correlationIdValue?: string): T {
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
export function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`Path parameter '${name}' is required`, {
      details: [{ path: name, message: 'required path parameter' }],
      correlationId: req.correlationId,
    });
  }
  return value;
}

function zodDetails(error: ZodError): AppError['details'] {
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
export function errorHandler(logger: Logger) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const appError: AppError = isAppError(error)
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
    } else {
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
export function notFoundHandler(): RequestHandler {
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
