import { InMemoryStaffRepository } from './staff.repository.js';
import { StaffService } from './staff.service.js';
export function createStaffModule(deps) {
    const repository = deps.repository ?? new InMemoryStaffRepository();
    const service = new StaffService({
        repository,
        clock: deps.clock,
        logger: deps.logger,
    });
    return { service };
}
//# sourceMappingURL=index.js.map