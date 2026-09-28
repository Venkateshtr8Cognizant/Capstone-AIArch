export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const TASK_CATEGORIES = [
    'RESTOCKING',
    'PLANOGRAM',
    'AUDIT',
    'COMPLIANCE',
    'GENERAL',
];
/**
 * Legal status transitions.
 *
 * `DONE` is terminal: reopening completed work would corrupt the completion
 * metrics the reports module aggregates. `BLOCKED` can be resumed.
 */
export const TASK_TRANSITIONS = {
    TODO: ['IN_PROGRESS', 'BLOCKED', 'DONE'],
    IN_PROGRESS: ['BLOCKED', 'DONE'],
    BLOCKED: ['IN_PROGRESS', 'DONE'],
    DONE: [],
};
/** Statuses a bulk shift-handover request may set (SPEC 3.4, feature 1). */
export const BULK_TARGET_STATUSES = ['DONE', 'BLOCKED'];
/** Maximum items accepted in one bulk status request (BR-1). */
export const MAX_BULK_BATCH_SIZE = 50;
/** Priorities that escalate when a task is blocked or breaches SLA. */
export const ESCALATING_PRIORITIES = ['HIGH', 'CRITICAL'];
export function canTransition(from, to) {
    return TASK_TRANSITIONS[from].includes(to);
}
export function appendAudit(task, entry) {
    return { ...task, audit: [...task.audit, entry], updatedAt: entry.at };
}
//# sourceMappingURL=activities.types.js.map