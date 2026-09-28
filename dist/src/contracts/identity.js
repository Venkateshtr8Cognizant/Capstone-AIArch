/**
 * Shared identity vocabulary.
 *
 * Lives in `src/contracts/` because the platform's auth middleware and every
 * module need it, and the platform layer must not import module code.
 * `src/contracts/**` is dependency-free by rule MB-3 of the harness gate.
 */
export const STAFF_ROLES = [
    'REGIONAL_MANAGER',
    'STORE_MANAGER',
    'DEPARTMENT_LEAD',
    'ASSOCIATE',
];
export function isAtLeast(role, minimum) {
    const rank = {
        ASSOCIATE: 0,
        DEPARTMENT_LEAD: 1,
        STORE_MANAGER: 2,
        REGIONAL_MANAGER: 3,
    };
    return rank[role] >= rank[minimum];
}
//# sourceMappingURL=identity.js.map