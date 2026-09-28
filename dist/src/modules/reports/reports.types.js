export const REPORT_TYPES = [
    'STORE_SUMMARY',
    'REGIONAL_ROLLUP',
    'DEPARTMENT_PERFORMANCE',
];
export const REPORT_STATUSES = ['PENDING', 'READY', 'FAILED'];
export function emptyMetrics() {
    return {
        totalActivities: 0,
        completedActivities: 0,
        blockedActivities: 0,
        completionRate: 0,
        overdueByCategory: {
            RESTOCKING: 0,
            PLANOGRAM: 0,
            AUDIT: 0,
            COMPLIANCE: 0,
            GENERAL: 0,
        },
        blockedTaskIds: [],
    };
}
//# sourceMappingURL=reports.types.js.map