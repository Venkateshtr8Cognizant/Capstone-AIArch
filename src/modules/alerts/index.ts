/**
 * PUBLIC CONTRACT — alerts module.
 *
 * Notifications are created by this module's own subscribers in reaction to
 * `activities.*` events. No sibling module may write alerts state, and
 * `alerts.repository.ts` is module-private.
 */
import type { Router } from 'express';
import type { EventBus } from '../../platform/events/event-bus.js';
import type { Clock } from '../../platform/support/clock.js';
import type { IdGenerator } from '../../platform/support/ids.js';
import type { Logger } from '../../platform/support/logger.js';
import type { StaffReadPort } from '../staff/index.js';
import { InMemoryAlertRepository, type AlertRepository } from './alerts.repository.js';
import { createAlertsRouter } from './alerts.routes.js';
import { AlertService } from './alerts.service.js';
import { registerAlertSubscribers } from './alerts.subscribers.js';

export type { AlertReadPort, NotificationView } from './alerts.service.js';
export type { Notification, NotificationChannel, NotificationStatus } from './alerts.types.js';

export type AlertsModule = {
  service: AlertService;
  router: Router;
};

export function createAlertsModule(deps: {
  staff: StaffReadPort;
  events: EventBus;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  repository?: AlertRepository;
}): AlertsModule {
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
