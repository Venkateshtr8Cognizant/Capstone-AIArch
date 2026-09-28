/**
 * PUBLIC CONTRACT — programmes module.
 *
 * Sibling modules may import ONLY this file. `programmes.repository.ts` is
 * module-private.
 */
import type { Router } from 'express';
import type { EventBus } from '../../platform/events/event-bus.js';
import type { Clock } from '../../platform/support/clock.js';
import type { IdGenerator } from '../../platform/support/ids.js';
import type { Logger } from '../../platform/support/logger.js';
import type { ActivityReadPort } from '../activities/index.js';
import type { StaffReadPort } from '../staff/index.js';
import {
  InMemoryProgrammeRepository,
  type ProgrammeRepository,
} from './programmes.repository.js';
import { createProgrammesRouter } from './programmes.routes.js';
import { ProgrammeService } from './programmes.service.js';

export type { ProgrammeReadPort, ProjectView } from './programmes.service.js';
export type { Project, ProjectMember, ProjectRole, ProjectStatus } from './programmes.types.js';

export type ProgrammesModule = {
  service: ProgrammeService;
  router: Router;
};

export function createProgrammesModule(deps: {
  staff: StaffReadPort;
  activities: ActivityReadPort;
  events: EventBus;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  repository?: ProgrammeRepository;
}): ProgrammesModule {
  const repository = deps.repository ?? new InMemoryProgrammeRepository();
  const service = new ProgrammeService({
    repository,
    staff: deps.staff,
    activities: deps.activities,
    events: deps.events,
    clock: deps.clock,
    ids: deps.ids,
    logger: deps.logger,
  });

  return { service, router: createProgrammesRouter(service) };
}
