import { InMemoryActivityRepository, } from './activities.repository.js';
import { createActivitiesRouter } from './activities.routes.js';
import { ActivityService } from './activities.service.js';
export { MAX_BULK_BATCH_SIZE, TASK_TRANSITIONS, canTransition } from './activities.types.js';
export function createActivitiesModule(deps) {
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
//# sourceMappingURL=index.js.map