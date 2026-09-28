/**
 * PUBLIC CONTRACT — reports module.
 *
 * reports is read-only with respect to the rest of StoreOps: it aggregates
 * activities, programmes and staff through their public read ports and never
 * writes to them.
 *
 * SPEC 3.6: reports has no endpoint in the base API surface. The regional
 * rollup endpoint (`GET /api/reports/region/:id`) is backlog item F-3 and
 * will be added by a later harness run; `reports.routes.ts` arrives with it.
 */
import type { EventBus } from '../../platform/events/event-bus.js';
import type { Clock } from '../../platform/support/clock.js';
import type { IdGenerator } from '../../platform/support/ids.js';
import type { Logger } from '../../platform/support/logger.js';
import type { ActivityReadPort } from '../activities/index.js';
import type { ProgrammeReadPort } from '../programmes/index.js';
import { InMemoryReportRepository, type ReportRepository } from './reports.repository.js';
import { ReportService } from './reports.service.js';
import { registerReportSubscribers } from './reports.subscribers.js';

export type { Report, ReportMetrics, ReportStatus } from './reports.types.js';
export { summarise } from './reports.service.js';

export type ReportsModule = {
  service: ReportService;
};

export function createReportsModule(deps: {
  activities: ActivityReadPort;
  programmes: ProgrammeReadPort;
  events: EventBus;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  repository?: ReportRepository;
}): ReportsModule {
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
