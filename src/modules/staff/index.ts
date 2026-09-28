/**
 * PUBLIC CONTRACT — staff module (auth-only, SPEC 3.6).
 *
 * Every other module may import ONLY this file. `staff.repository.ts` and
 * `staff.service.ts` are module-private; importing them from a sibling is
 * failure mode F1 and a blocking gate finding.
 *
 * staff is read-only for the rest of StoreOps: `StaffReadPort` exposes
 * lookups and token resolution, and nothing else.
 */
import type { Clock } from '../../platform/support/clock.js';
import type { Logger } from '../../platform/support/logger.js';
import { InMemoryStaffRepository, type StaffRepository } from './staff.repository.js';
import { StaffService } from './staff.service.js';

export type { StaffReadPort } from './staff.service.js';
export type { AuthToken, User, UserProfile } from './staff.types.js';

export type StaffModule = {
  /** Read-only port for sibling modules and the auth middleware. */
  service: StaffService;
};

export function createStaffModule(deps: {
  clock: Clock;
  logger: Logger;
  repository?: StaffRepository;
}): StaffModule {
  const repository = deps.repository ?? new InMemoryStaffRepository();
  const service = new StaffService({
    repository,
    clock: deps.clock,
    logger: deps.logger,
  });

  return { service };
}
