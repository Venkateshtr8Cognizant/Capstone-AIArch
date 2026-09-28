import { Router } from 'express';
import { z } from 'zod';
import { parseBody, pathParam, principalOf, route } from '../../platform/http/middleware.js';
import type { ProgrammeService } from './programmes.service.js';
import { PROJECT_ROLES } from './programmes.types.js';

const createSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(500).nullable().optional(),
});

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(PROJECT_ROLES as unknown as [string, ...string[]]),
});

export function createProgrammesRouter(service: ProgrammeService): Router {
  const router = Router();

  // GET /api/programmes — programmes for the authenticated store.
  router.get(
    '/programmes',
    route(async (req, res) => {
      const programmes = await service.list(principalOf(req));
      res.status(200).json({ data: programmes });
    }),
  );

  // POST /api/programmes — create a programme.
  router.post(
    '/programmes',
    route(async (req, res) => {
      const body = parseBody(createSchema, req.body, req.correlationId);
      const programme = await service.create(
        principalOf(req),
        body,
        req.correlationId ?? 'unknown',
      );
      res.status(201).json({ data: programme });
    }),
  );

  // POST /api/programmes/:id/members — add a staff member to a programme.
  router.post(
    '/programmes/:id/members',
    route(async (req, res) => {
      const body = parseBody(addMemberSchema, req.body, req.correlationId);
      const programme = await service.addMember(
        principalOf(req),
        pathParam(req, 'id'),
        body as never,
        req.correlationId ?? 'unknown',
      );
      res.status(201).json({ data: programme });
    }),
  );

  // POST /api/programmes/:id/close — triggers the STORE_SUMMARY recompute
  // through the event bus (SPEC 3.3 cross-module example).
  router.post(
    '/programmes/:id/close',
    route(async (req, res) => {
      const programme = await service.close(
        principalOf(req),
        pathParam(req, 'id'),
        req.correlationId ?? 'unknown',
      );
      res.status(200).json({ data: programme });
    }),
  );

  return router;
}
