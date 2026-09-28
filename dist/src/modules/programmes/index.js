import { InMemoryProgrammeRepository, } from './programmes.repository.js';
import { createProgrammesRouter } from './programmes.routes.js';
import { ProgrammeService } from './programmes.service.js';
export function createProgrammesModule(deps) {
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
//# sourceMappingURL=index.js.map