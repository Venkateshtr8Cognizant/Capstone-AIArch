import { Router } from 'express';
import { principalOf, route } from '../../platform/http/middleware.js';
export function createAlertsRouter(service) {
    const router = Router();
    // GET /api/alerts — alerts for the authenticated user.
    router.get('/alerts', route(async (req, res) => {
        const alerts = await service.listForPrincipal(principalOf(req));
        res.status(200).json({ data: alerts });
    }));
    return router;
}
//# sourceMappingURL=alerts.routes.js.map