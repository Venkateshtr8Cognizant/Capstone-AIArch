/**
 * PUBLIC CONTRACT — activities module.
 *
 * Sibling modules may import ONLY this file. `activities.repository.ts` is
 * module-private; reaching it from another module is failure mode F1 and a
 * blocking gate finding (MB-1/MB-6).
 *
 * Cross-module reads use `ActivityReadPort`. Cross-module side effects are
 * driven by the `activities.*` events in `src/contracts/events.ts`.
 */
import type { Router } from 'express';
import type { StoreId } from '../../contracts/identity.js';
import type { EventBus } from '../../platform/events/event-bus.js';
import type { Clock } from '../../platform/support/clock.js';
import type { IdGenerator } from '../../platform/support/ids.js';
import type { Logger } from '../../platform/support/logger.js';
import type { StaffReadPort } from '../staff/index.js';
import {
  InMemoryActivityRepository,
  type ActivityRepository,
} from './activities.repository.js';
import { createActivitiesRouter } from './activities.routes.js';
import { ActivityService, type TaskView } from './activities.service.js';

export type { TaskView, BulkStatusResult } from './activities.service.js';
export type { Task, TaskAuditEntry, BulkTargetStatus } from './activities.types.js';
export type { BulkStatusRequest, ItemFailure, ItemFailureCode } from './bulk-status.rules.js';
export { MAX_BULK_BATCH_SIZE, TASK_TRANSITIONS, canTransition } from './activities.types.js';

/** Read-only surface offered to sibling modules (reports aggregates on it). */
export interface ActivityReadPort {
  listForStore(storeId: StoreId): Promise<TaskView[]>;
}

export type ActivitiesModule = {
  service: ActivityService;
  router: Router;
};

export function createActivitiesModule(deps: {
  staff: StaffReadPort;
  events: EventBus;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  repository?: ActivityRepository;
}): ActivitiesModule {
  const repository = deps.repository ?? new InMemoryActivityRepository();
  const service = new ActivityService({
    repository,
    staff: deps.staff,
    events: deps.events,
    clock: deps.clock,
    ids: deps.ids,
    logger: deps.logger,
  });

  return { service, router: createActivitiesRouter(service) };
}
