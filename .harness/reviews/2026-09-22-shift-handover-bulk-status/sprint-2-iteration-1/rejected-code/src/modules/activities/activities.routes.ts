// REJECTED ITERATION 1 — preserved as evidence. Do not copy.
import { Router } from 'express';
import { z } from 'zod';
import type { ActivityService } from './activities.service.js';

const bulkStatusSchema = z.object({
  taskIds: z.array(z.string()).min(1).max(50),
  targetStatus: z.enum(['DONE', 'BLOCKED']),
  note: z.string().optional(),
});

export function createActivitiesRouter(service: ActivityService): Router {
  const router = Router();

  router.patch('/activities/bulk-status', async (req, res) => {
    const parsed = bulkStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      // ❌ F2 / EH-4 — hand-rolled error response. The body shape does not
      // match the project envelope, so no client can parse it consistently,
      // and the error middleware never sees the failure.
      res.status(400).json({ message: 'invalid request' });
      return;
    }

    // ❌ BR-3 enforced here with a hand-rolled 422 rather than a typed
    // BusinessRuleError, so the response carries no rule id and the test
    // cannot assert which rule fired.
    if (parsed.data.targetStatus === 'BLOCKED' && !parsed.data.note) {
      res.status(422).json({ message: 'note required when blocking' });
      return;
    }

    try {
      const result = await service.bulkUpdateStatus(
        req.principal!,
        parsed.data,
        req.correlationId ?? 'unknown',
      );
      res.status(200).json({ data: result });
    } catch (error) {
      // ❌ F2 / EH-4 — every failure collapses into a 500 with a stringified
      // message. A BusinessRuleError that reached here would lose its rule.
      res.status(500).json({ message: String(error) });
    }
  });

  return router;
}
