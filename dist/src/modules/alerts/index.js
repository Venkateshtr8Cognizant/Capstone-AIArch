import { InMemoryAlertRepository } from './alerts.repository.js';
import { createAlertsRouter } from './alerts.routes.js';
import { AlertService } from './alerts.service.js';
import { registerAlertSubscribers } from './alerts.subscribers.js';
export function createAlertsModule(deps) {
    const repository = deps.repository ?? new InMemoryAlertRepository();
    const service = new AlertService({
        repository,
        events: deps.events,
        clock: deps.clock,
        ids: deps.ids,
        logger: deps.logger,
    });
    registerAlertSubscribers({
        events: deps.events,
        service,
        staff: deps.staff,
        logger: deps.logger,
    });
    return { service, router: createAlertsRouter(service) };
}
//# sourceMappingURL=index.js.map