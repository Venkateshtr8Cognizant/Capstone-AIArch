import express, { type Express } from 'express';
import { InMemoryEventBus, type EventBus } from './platform/events/event-bus.js';
import {
  authenticate,
  correlationId,
  errorHandler,
  notFoundHandler,
} from './platform/http/middleware.js';
import { SystemClock, type Clock } from './platform/support/clock.js';
import { UuidIdGenerator, type IdGenerator } from './platform/support/ids.js';
import { JsonLogger, type Logger } from './platform/support/logger.js';
import { createActivitiesModule, type ActivitiesModule } from './modules/activities/index.js';
import { createAlertsModule, type AlertsModule } from './modules/alerts/index.js';
import { createProgrammesModule, type ProgrammesModule } from './modules/programmes/index.js';
import { createReportsModule, type ReportsModule } from './modules/reports/index.js';
import { createStaffModule, type StaffModule } from './modules/staff/index.js';

export type StoreOps = {
  app: Express;
  bus: EventBus;
  clock: Clock;
  staff: StaffModule;
  activities: ActivitiesModule;
  programmes: ProgrammesModule;
  alerts: AlertsModule;
  reports: ReportsModule;
};

/**
 * Composition root.
 *
 * The ONLY file allowed to know about more than one module. Modules are
 * wired to each other in exactly two permitted ways (SPEC 3.3):
 *   1. read-only ports — `staff.service` is handed to activities as a
 *      `StaffReadPort`, `activities.service` to reports as an
 *      `ActivityReadPort`;
 *   2. the event bus — every cross-module side effect.
 *
 * Subscribers are registered inside each module's own factory, so a module
 * owns both sides of its state.
 */
export function createStoreOps(
  overrides: { clock?: Clock; ids?: IdGenerator; logger?: Logger } = {},
): StoreOps {
  const clock = overrides.clock ?? new SystemClock();
  const ids = overrides.ids ?? new UuidIdGenerator();
  const logger = overrides.logger ?? new JsonLogger();
  const bus = new InMemoryEventBus({ clock, ids, logger });

  const staff = createStaffModule({ clock, logger });
  const activities = createActivitiesModule({
    staff: staff.service,
    events: bus,
    clock,
    ids,
    logger,
  });
  const programmes = createProgrammesModule({
    staff: staff.service,
    activities: activities.service,
    events: bus,
    clock,
    ids,
    logger,
  });
  const alerts = createAlertsModule({
    staff: staff.service,
    events: bus,
    clock,
    ids,
    logger,
  });
  const reports = createReportsModule({
    activities: activities.service,
    programmes: programmes.service,
    events: bus,
    clock,
    ids,
    logger,
  });

  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use(correlationId());

  // Unauthenticated operational endpoint.
  app.get('/health', (_req, res) => {
    res.status(200).json({ data: { status: 'ok', time: clock.nowIso() } });
  });

  // Everything under /api requires a bearer token. staff is the auth-only
  // module: this is the single place a token becomes a principal.
  const api = express.Router();
  api.use(authenticate((token) => staff.service.resolveToken(token)));
  api.use(activities.router);
  api.use(programmes.router);
  api.use(alerts.router);
  app.use('/api', api);

  app.use(notFoundHandler());
  app.use(errorHandler(logger));

  return { app, bus, clock, staff, activities, programmes, alerts, reports };
}
