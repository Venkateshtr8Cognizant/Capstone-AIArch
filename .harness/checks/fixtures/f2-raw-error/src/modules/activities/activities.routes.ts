// FIXTURE — FAILURE MODE F2 (deliberate violation, do not copy).
//
// The route builds its own error responses, so the wire format drifts from
// every other endpoint and the error middleware never sees the failure.
import type { Request, Response } from 'express';
import type { ActivityService } from './activities.service.js';

export function createActivitiesRouter(service: ActivityService) {
  return async (req: Request, res: Response) => {
    if (!req.body?.taskIds) {
      // EH-4: hand-rolled 400.
      res.status(400).json({ message: 'taskIds is required' });
      return;
    }

    try {
      await service.bulkUpdateStatus(req.body.taskIds, req.body.targetStatus);
      res.status(200).json({ ok: true });
    } catch (error) {
      // EH-4: hand-rolled 500 with a stringified error.
      res.status(500).json({ message: String(error) });
    }
  };
}
