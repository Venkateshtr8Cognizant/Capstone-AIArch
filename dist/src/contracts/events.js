/**
 * Which module owns — and is therefore the only module allowed to publish —
 * each event type. The harness event check reads this map to prove that no
 * module publishes another module's events.
 */
export const EVENT_OWNERS = {
    'activities.task.created': 'activities',
    'activities.task.status_changed': 'activities',
    'activities.bulk_status.completed': 'activities',
    'programmes.member.added': 'programmes',
    'programmes.programme.closed': 'programmes',
    'alerts.notification.created': 'alerts',
    'reports.report.requested': 'reports',
};
export const STOREOPS_EVENT_TYPES = Object.keys(EVENT_OWNERS);
//# sourceMappingURL=events.js.map