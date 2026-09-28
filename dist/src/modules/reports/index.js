import { InMemoryReportRepository } from './reports.repository.js';
import { ReportService } from './reports.service.js';
import { registerReportSubscribers } from './reports.subscribers.js';
export { summarise } from './reports.service.js';
export function createReportsModule(deps) {
    const repository = deps.repository ?? new InMemoryReportRepository();
    const service = new ReportService({
        repository,
        activities: deps.activities,
        programmes: deps.programmes,
        events: deps.events,
        clock: deps.clock,
        ids: deps.ids,
        logger: deps.logger,
    });
    registerReportSubscribers({ events: deps.events, service, logger: deps.logger });
    return { service };
}
//# sourceMappingURL=index.js.map