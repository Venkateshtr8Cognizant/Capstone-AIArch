export class InMemoryStaffRepository {
    users = new Map();
    profiles = new Map();
    tokens = new Map();
    async findUser(userId) {
        const user = this.users.get(userId);
        return user ? { ...user } : null;
    }
    async findProfile(userId) {
        const profile = this.profiles.get(userId);
        return profile ? { ...profile } : null;
    }
    async findToken(token) {
        const found = this.tokens.get(token);
        return found ? { ...found } : null;
    }
    async listByStore(storeId) {
        return [...this.users.values()].filter((user) => user.storeId === storeId).map((user) => ({ ...user }));
    }
    async listByDepartment(storeId, departmentId) {
        const profileIds = new Set([...this.profiles.values()]
            .filter((profile) => profile.departmentId === departmentId)
            .map((profile) => profile.userId));
        return [...this.users.values()]
            .filter((user) => user.storeId === storeId && profileIds.has(user.userId))
            .map((user) => ({ ...user }));
    }
    async saveUser(user) {
        this.users.set(user.userId, { ...user });
    }
    async saveProfile(profile) {
        this.profiles.set(profile.userId, { ...profile });
    }
    async saveToken(token) {
        this.tokens.set(token.token, { ...token });
    }
}
//# sourceMappingURL=staff.repository.js.map