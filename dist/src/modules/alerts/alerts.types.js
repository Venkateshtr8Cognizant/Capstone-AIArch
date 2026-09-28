export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL'];
export const NOTIFICATION_STATUSES = [
    'PENDING',
    'SENT',
    'READ',
    'FAILED',
];
/**
 * Channel routing policy: escalations and SLA breaches reach people by email,
 * routine handover summaries stay in-app.
 */
export function channelFor(type) {
    return type === 'SLA_BREACH' || type === 'ESCALATION' ? 'EMAIL' : 'IN_APP';
}
//# sourceMappingURL=alerts.types.js.map