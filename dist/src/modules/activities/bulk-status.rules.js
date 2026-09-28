import { MAX_BULK_BATCH_SIZE, canTransition, } from './activities.types.js';
export function planBulkStatusUpdate(input) {
    const { request, tasks, principal } = input;
    const rejections = [];
    // BR-1 — batch bounds and uniqueness.
    if (request.taskIds.length === 0) {
        rejections.push({
            rule: 'BR-1',
            path: 'taskIds',
            message: 'A bulk status update must contain at least one activity id',
        });
    }
    if (request.taskIds.length > MAX_BULK_BATCH_SIZE) {
        rejections.push({
            rule: 'BR-1',
            path: 'taskIds',
            message: `A bulk status update may contain at most ${MAX_BULK_BATCH_SIZE} activities, received ${request.taskIds.length}`,
        });
    }
    for (const duplicate of findDuplicates(request.taskIds)) {
        rejections.push({
            rule: 'BR-1',
            path: `taskIds[${request.taskIds.indexOf(duplicate)}]`,
            message: `Activity '${duplicate}' appears more than once in the batch`,
        });
    }
    // BR-2 — only DONE and BLOCKED are reachable in bulk.
    if (request.targetStatus !== 'DONE' && request.targetStatus !== 'BLOCKED') {
        rejections.push({
            rule: 'BR-2',
            path: 'targetStatus',
            message: `A bulk status update may only set DONE or BLOCKED, received '${String(request.targetStatus)}'`,
        });
    }
    // BR-3 — blocking work requires a reason for the audit trail.
    if (request.targetStatus === 'BLOCKED' && !request.note?.trim()) {
        rejections.push({
            rule: 'BR-3',
            path: 'note',
            message: 'A note explaining the blocker is required when setting BLOCKED',
        });
    }
    if (rejections.length > 0) {
        return { rejections, accepted: [], failed: [] };
    }
    // Per-item evaluation. Every item is judged independently, because the
    // operation supports partial failure (SPEC 3.4, feature 1).
    const tasksById = new Map(tasks.map((task) => [task.taskId, task]));
    const accepted = [];
    const failed = [];
    for (const taskId of request.taskIds) {
        const task = tasksById.get(taskId);
        // BR-4 — item must exist.
        if (!task) {
            failed.push({
                taskId,
                code: 'ACTIVITY_NOT_FOUND',
                rule: 'BR-4',
                message: `Activity '${taskId}' does not exist`,
            });
            continue;
        }
        // BR-5 — no cross-store updates, whatever the caller's role.
        if (task.storeId !== principal.storeId) {
            failed.push({
                taskId,
                code: 'CROSS_STORE_FORBIDDEN',
                rule: 'BR-5',
                message: `Activity '${taskId}' belongs to store '${task.storeId}', not '${principal.storeId}'`,
            });
            continue;
        }
        // BR-6 — transition must be legal for the item's current status.
        if (!canTransition(task.status, request.targetStatus)) {
            failed.push({
                taskId,
                code: 'ILLEGAL_TRANSITION',
                rule: 'BR-6',
                message: `Activity '${taskId}' cannot move from ${task.status} to ${request.targetStatus}`,
            });
            continue;
        }
        // BR-7 — the caller must own or supervise the item.
        if (!mayUpdate(task, principal)) {
            failed.push({
                taskId,
                code: 'NOT_PERMITTED',
                rule: 'BR-7',
                message: `User '${principal.userId}' (${principal.role}) may not update activity '${taskId}'`,
            });
            continue;
        }
        accepted.push({ task, fromStatus: task.status });
    }
    // BR-9 — a batch in which nothing succeeded is a rejected request, not a
    // successful no-op: the caller must be able to tell the two apart.
    if (accepted.length === 0 && failed.length > 0) {
        rejections.push({
            rule: 'BR-9',
            path: 'taskIds',
            message: `No activity in the batch could be updated (${failed.length} item failure(s))`,
        });
    }
    return { rejections, accepted, failed };
}
/**
 * BR-7 — who may change an activity's status:
 *  - the assignee;
 *  - the DEPARTMENT_LEAD of the activity's department;
 *  - a STORE_MANAGER or REGIONAL_MANAGER of the activity's store.
 */
export function mayUpdate(task, principal) {
    if (principal.role === 'STORE_MANAGER' || principal.role === 'REGIONAL_MANAGER') {
        return true;
    }
    if (task.assigneeId && task.assigneeId === principal.userId) {
        return true;
    }
    if (principal.role === 'DEPARTMENT_LEAD' &&
        task.departmentId !== null &&
        task.departmentId === principal.departmentId) {
        return true;
    }
    return false;
}
function findDuplicates(values) {
    const seen = new Set();
    const duplicates = new Set();
    for (const value of values) {
        if (seen.has(value)) {
            duplicates.add(value);
        }
        seen.add(value);
    }
    return [...duplicates];
}
//# sourceMappingURL=bulk-status.rules.js.map