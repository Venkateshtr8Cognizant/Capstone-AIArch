import { createStoreOps } from '../../src/app.js';
import { FixedClock } from '../../src/platform/support/clock.js';
import { SequentialIdGenerator } from '../../src/platform/support/ids.js';
import { RecordingLogger } from '../../src/platform/support/logger.js';
import { DEPT_CHILLED, DEPT_GROCERY, REGION_ID, STORE_ID, USERS, seedDemoData, } from '../../src/seed.js';
export { DEPT_CHILLED, DEPT_GROCERY, REGION_ID, STORE_ID, USERS };
/**
 * Builds a StoreOps instance with a deterministic clock and id generator and
 * a realistic single-store roster. Used by every test and by the harness
 * demonstration run, so results are reproducible.
 */
export async function buildFixture() {
    const clock = new FixedClock('2026-09-22T13:00:00.000Z');
    const logger = new RecordingLogger();
    const ops = createStoreOps({ clock, ids: new SequentialIdGenerator(), logger });
    await seedDemoData(ops);
    const bus = ops.bus;
    const principals = {
        regionalManager: {
            userId: USERS.regionalManager.userId,
            storeId: STORE_ID,
            regionId: REGION_ID,
            role: 'REGIONAL_MANAGER',
            departmentId: null,
        },
        storeManager: {
            userId: USERS.storeManager.userId,
            storeId: STORE_ID,
            regionId: REGION_ID,
            role: 'STORE_MANAGER',
            departmentId: null,
        },
        groceryLead: {
            userId: USERS.groceryLead.userId,
            storeId: STORE_ID,
            regionId: REGION_ID,
            role: 'DEPARTMENT_LEAD',
            departmentId: DEPT_GROCERY,
        },
        chilledLead: {
            userId: USERS.chilledLead.userId,
            storeId: STORE_ID,
            regionId: REGION_ID,
            role: 'DEPARTMENT_LEAD',
            departmentId: DEPT_CHILLED,
        },
        associateEarly: {
            userId: USERS.associateEarly.userId,
            storeId: STORE_ID,
            regionId: REGION_ID,
            role: 'ASSOCIATE',
            departmentId: DEPT_GROCERY,
        },
        associateLate: {
            userId: USERS.associateLate.userId,
            storeId: STORE_ID,
            regionId: REGION_ID,
            role: 'ASSOCIATE',
            departmentId: DEPT_CHILLED,
        },
    };
    return {
        ...ops,
        clock,
        logger,
        events: (type) => bus.published(type),
        subscribersOf: (type) => bus.subscriberNames(type),
        principal: (user) => principals[user],
    };
}
/** Bearer header for a seeded user. */
export function auth(user) {
    return ['authorization', `Bearer ${USERS[user].token}`];
}
/**
 * Seeds an activity through the service layer and returns its id.
 * Defaults to a grocery RESTOCKING task assigned to the early associate.
 */
export async function seedActivity(fixture, overrides = {}) {
    const creator = overrides.createdBy ?? 'groceryLead';
    const activity = await fixture.activities.service.create(fixture.principal(creator), {
        title: overrides.title ?? 'Restock grocery aisle 4',
        priority: overrides.priority ?? 'MEDIUM',
        category: overrides.category ?? 'RESTOCKING',
        departmentId: overrides.departmentId === undefined ? DEPT_GROCERY : overrides.departmentId,
        assigneeId: overrides.assigneeId === undefined ? USERS.associateEarly.userId : overrides.assigneeId,
        programmeId: overrides.programmeId ?? null,
        dueAt: overrides.dueAt ?? null,
    }, 'corr_seed');
    return activity.taskId;
}
//# sourceMappingURL=storeops-fixture.js.map