import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/platform/errors/index.js';
import { DEPT_CHILLED, DEPT_GROCERY, STORE_ID, USERS, buildFixture, } from '../support/storeops-fixture.js';
/**
 * staff is the auth-only module: it validates tokens issued by the client's
 * identity provider and exposes read lookups to sibling modules. These tests
 * cover the paths the rest of StoreOps depends on — token resolution and
 * escalation targeting.
 */
describe('StaffService — token resolution', () => {
    let fixture;
    beforeEach(async () => {
        fixture = await buildFixture();
    });
    it('projects a valid token onto a principal carrying store, region, role and department', async () => {
        const principal = await fixture.staff.service.resolveToken(USERS.groceryLead.token);
        expect(principal).toEqual({
            userId: USERS.groceryLead.userId,
            storeId: STORE_ID,
            regionId: 'region_north',
            role: 'DEPARTMENT_LEAD',
            departmentId: DEPT_GROCERY,
        });
    });
    it('returns null for an unknown token', async () => {
        expect(await fixture.staff.service.resolveToken('not-a-real-token')).toBeNull();
    });
    it('refuses an expired token and logs why', async () => {
        // Seeded tokens have an 8 hour TTL from the fixture clock (13:00Z).
        fixture.clock.advance(9 * 60 * 60 * 1000);
        expect(await fixture.staff.service.resolveToken(USERS.groceryLead.token)).toBeNull();
        expect(fixture.logger.has('staff.token_expired')).toBe(true);
    });
    it('refuses a valid token belonging to a deactivated colleague', async () => {
        await fixture.staff.service.provisionUser({
            user: {
                userId: 'user_former',
                storeId: STORE_ID,
                regionId: 'region_north',
                email: 'former@retail.example',
                role: 'ASSOCIATE',
                active: false,
            },
            token: { token: 'token-former' },
        });
        expect(await fixture.staff.service.resolveToken('token-former')).toBeNull();
        expect(fixture.logger.has('staff.token_user_inactive')).toBe(true);
    });
    it('reports a null department for a colleague with no profile', async () => {
        await fixture.staff.service.provisionUser({
            user: {
                userId: 'user_noprofile',
                storeId: STORE_ID,
                regionId: 'region_north',
                email: 'noprofile@retail.example',
                role: 'ASSOCIATE',
                active: true,
            },
            token: { token: 'token-noprofile' },
        });
        const principal = await fixture.staff.service.resolveToken('token-noprofile');
        expect(principal?.departmentId).toBeNull();
    });
});
describe('StaffReadPort — lookups used by sibling modules', () => {
    let fixture;
    beforeEach(async () => {
        fixture = await buildFixture();
    });
    it('finds the department lead for escalation routing', async () => {
        const lead = await fixture.staff.service.findDepartmentLead(STORE_ID, DEPT_CHILLED);
        expect(lead?.userId).toBe(USERS.chilledLead.userId);
        expect(lead?.role).toBe('DEPARTMENT_LEAD');
    });
    it('returns null when a department has no lead, so alerts can fall back', async () => {
        expect(await fixture.staff.service.findDepartmentLead(STORE_ID, 'dept_bakery')).toBeNull();
    });
    it('lists active store managers only', async () => {
        await fixture.staff.service.provisionUser({
            user: {
                userId: 'user_retired_manager',
                storeId: STORE_ID,
                regionId: 'region_north',
                email: 'retired@retail.example',
                role: 'STORE_MANAGER',
                active: false,
            },
        });
        const managers = await fixture.staff.service.listStoreManagers(STORE_ID);
        expect(managers.map((manager) => manager.userId)).toEqual([USERS.storeManager.userId]);
    });
    it('does not leak staff from another store', async () => {
        const managers = await fixture.staff.service.listStoreManagers('store_902');
        expect(managers.map((manager) => manager.userId)).toEqual(['user_erin']);
        const ownStore = await fixture.staff.service.listByStore(STORE_ID);
        expect(ownStore.some((user) => user.userId === 'user_erin')).toBe(false);
    });
    it('raises a typed NotFoundError for an unknown colleague', async () => {
        await expect(fixture.staff.service.getUser('user_ghost')).rejects.toBeInstanceOf(NotFoundError);
        expect(await fixture.staff.service.findUser('user_ghost')).toBeNull();
    });
    it('returns the profile a sibling module needs for department routing', async () => {
        const profile = await fixture.staff.service.findProfile(USERS.associateEarly.userId);
        expect(profile).toMatchObject({ departmentId: DEPT_GROCERY, displayName: 'Alice' });
        expect(await fixture.staff.service.findProfile('user_ghost')).toBeNull();
    });
    it('resolves a colleague by id for assignment validation', async () => {
        const user = await fixture.staff.service.getUser(USERS.associateLate.userId);
        expect(user).toMatchObject({ storeId: STORE_ID, role: 'ASSOCIATE', active: true });
    });
});
//# sourceMappingURL=staff.service.test.js.map