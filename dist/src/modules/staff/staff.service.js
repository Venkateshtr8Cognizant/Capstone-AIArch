import { NotFoundError } from '../../platform/errors/index.js';
export class StaffService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    // -- public read port --------------------------------------------------
    /**
     * Validates a bearer token and projects the user onto a `Principal`.
     * The only place in StoreOps where a token becomes an identity.
     */
    async resolveToken(token) {
        const found = await this.deps.repository.findToken(token);
        if (!found) {
            return null;
        }
        if (new Date(found.expiresAt).getTime() <= this.deps.clock.now().getTime()) {
            this.deps.logger.warn('staff.token_expired', { userId: found.userId });
            return null;
        }
        const user = await this.deps.repository.findUser(found.userId);
        if (!user || !user.active) {
            this.deps.logger.warn('staff.token_user_inactive', { userId: found.userId });
            return null;
        }
        const profile = await this.deps.repository.findProfile(user.userId);
        return {
            userId: user.userId,
            storeId: user.storeId,
            regionId: user.regionId,
            role: user.role,
            departmentId: profile?.departmentId ?? null,
        };
    }
    async findUser(userId) {
        return this.deps.repository.findUser(userId);
    }
    async getUser(userId) {
        const user = await this.deps.repository.findUser(userId);
        if (!user) {
            throw new NotFoundError('User', userId);
        }
        return user;
    }
    async findProfile(userId) {
        return this.deps.repository.findProfile(userId);
    }
    async findDepartmentLead(storeId, departmentId) {
        const candidates = await this.deps.repository.listByDepartment(storeId, departmentId);
        return candidates.find((user) => user.role === 'DEPARTMENT_LEAD' && user.active) ?? null;
    }
    async listStoreManagers(storeId) {
        const users = await this.deps.repository.listByStore(storeId);
        return users.filter((user) => user.role === 'STORE_MANAGER' && user.active);
    }
    async listByStore(storeId) {
        return this.deps.repository.listByStore(storeId);
    }
    // -- provisioning ------------------------------------------------------
    // Used by the seed script and tests. Tokens originate from the client's
    // identity provider; StoreOps stores no credentials.
    async provisionUser(input) {
        await this.deps.repository.saveUser(input.user);
        if (input.profile) {
            await this.deps.repository.saveProfile({ userId: input.user.userId, ...input.profile });
        }
        if (input.token) {
            const ttl = (input.token.ttlMinutes ?? 8 * 60) * 60 * 1000;
            const authToken = {
                token: input.token.token,
                userId: input.user.userId,
                expiresAt: new Date(this.deps.clock.now().getTime() + ttl).toISOString(),
            };
            await this.deps.repository.saveToken(authToken);
        }
    }
}
//# sourceMappingURL=staff.service.js.map