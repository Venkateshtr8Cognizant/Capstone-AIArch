import { Router } from 'express';
import { z } from 'zod';
import {
  parseBody,
  parseQuery,
  pathParam,
  principalOf,
  route,
} from '../../platform/http/middleware.js';
import {
  BULK_TARGET_STATUSES,
  MAX_BULK_BATCH_SIZE,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from './activities.types.js';
import type { ActivityService } from './activities.service.js';

const statusEnum = z.enum(TASK_STATUSES as unknown as [string, ...string[]]);
const priorityEnum = z.enum(TASK_PRIORITIES as unknown as [string, ...string[]]);
const categoryEnum = z.enum(TASK_CATEGORIES as unknown as [string, ...string[]]);

const listQuerySchema = z.object({
  programmeId: z.string().min(1).optional(),
  status: statusEnum.optional(),
});

const createSchema = z.object({
  title: z.string().min(3).max(140),
  priority: priorityEnum,
  category: categoryEnum,
  programmeId: z.string().min(1).nullable().optional(),
  departmentId: z.string().min(1).nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

const patchSchema = z
  .object({
    status: statusEnum.optional(),
    priority: priorityEnum.optional(),
    category: categoryEnum.optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field must be supplied',
  });

/**
 * Bulk status update (SPEC 3.4, feature 1).
 *
 * Schema bounds mirror BR-1/BR-2 so malformed batches are rejected at the
 * edge with 400; the service re-checks the same rules so the invariants also
 * hold for non-HTTP callers (scheduled jobs, future surfaces).
 */
const bulkStatusSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1).max(MAX_BULK_BATCH_SIZE),
  targetStatus: z.enum(BULK_TARGET_STATUSES),
  note: z.string().max(500).nullable().optional(),
});

export function createActivitiesRouter(service: ActivityService): Router {
  const router = Router();

  // GET /api/activities — list for the authenticated store.
  router.get(
    '/activities',
    route(async (req, res) => {
      const query = parseQuery(listQuerySchema, req.query, req.correlationId);
      const activities = await service.list(principalOf(req), {
        ...(query.programmeId ? { programmeId: query.programmeId } : {}),
        ...(query.status ? { status: query.status as never } : {}),
      });
      res.status(200).json({ data: activities });
    }),
  );

  // POST /api/activities — create an activity.
  router.post(
    '/activities',
    route(async (req, res) => {
      const body = parseBody(createSchema, req.body, req.correlationId);
      const activity = await service.create(
        principalOf(req),
        body as never,
        req.correlationId ?? 'unknown',
      );
      res.status(201).json({ data: activity });
    }),
  );

  /**
   * PATCH /api/activities/bulk-status — shift handover bulk update.
   *
   * Registered BEFORE `/activities/:id` so the literal path is not captured
   * by the parameterised route.
   *
   * 200 at least one activity updated; body carries `updated` and `failed`
   * 400 malformed batch (schema)
   * 401 no or invalid bearer token
   * 422 request-level rule violation, or no item could be updated (BR-9);
   *     `error.rule` and `error.details[].rule` name every rule that fired
   */
  router.patch(
    '/activities/bulk-status',
    route(async (req, res) => {
      const body = parseBody(bulkStatusSchema, req.body, req.correlationId);
      const result = await service.bulkUpdateStatus(
        principalOf(req),
        body,
        req.correlationId ?? 'unknown',
      );
      res.status(200).json({ data: result });
    }),
  );

  // GET /api/activities/:id — fetch one activity.
  router.get(
    '/activities/:id',
    route(async (req, res) => {
      const activity = await service.get(principalOf(req), pathParam(req, 'id'));
      res.status(200).json({ data: activity });
    }),
  );

  // PATCH /api/activities/:id — update status, priority, category, assignee.
  router.patch(
    '/activities/:id',
    route(async (req, res) => {
      const body = parseBody(patchSchema, req.body, req.correlationId);
      const activity = await service.patch(
        principalOf(req),
        pathParam(req, 'id'),
        body as never,
        req.correlationId ?? 'unknown',
      );
      res.status(200).json({ data: activity });
    }),
  );

  // DELETE /api/activities/:id — creator or store manager only.
  router.delete(
    '/activities/:id',
    route(async (req, res) => {
      await service.remove(principalOf(req), pathParam(req, 'id'), req.correlationId ?? 'unknown');
      res.status(204).send();
    }),
  );

  return router;
}
