export const PROJECT_ROLES = [
    'STORE_MANAGER',
    'DEPARTMENT_LEAD',
    'ASSOCIATE',
];
export const PROJECT_TRANSITIONS = {
    PLANNING: ['ACTIVE', 'CLOSED'],
    ACTIVE: ['CLOSED'],
    CLOSED: [],
};
/** A programme needs a store manager on it before it can go live. */
export const REQUIRED_ROLE_TO_ACTIVATE = 'STORE_MANAGER';
export function canTransition(from, to) {
    return PROJECT_TRANSITIONS[from].includes(to);
}
//# sourceMappingURL=programmes.types.js.map