import type { ReportType, TaskCategory } from '../../contracts/events.js';
import type { ReportId, UserId } from '../../contracts/identity.js';

/** SPEC 3.3 — reports module key types. */

export type ReportStatus = 'PENDING' | 'READY' | 'FAILED';

export const REPORT_TYPES: readonly ReportType[] = [
  'STORE_SUMMARY',
  'REGIONAL_ROLLUP',
  'DEPARTMENT_PERFORMANCE',
];

export const REPORT_STATUSES: readonly ReportStatus[] = ['PENDING', 'READY', 'FAILED'];

/** Aggregated figures — the shape every report payload shares. */
export type ReportMetrics = {
  totalActivities: number;
  completedActivities: number;
  blockedActivities: number;
  completionRate: number;
  overdueByCategory: Record<TaskCategory, number>;
  blockedTaskIds: string[];
};

export type Report = {
  reportId: ReportId;
  type: ReportType;
  /** Store id for STORE_SUMMARY, region id for REGIONAL_ROLLUP. */
  scopeId: string;
  status: ReportStatus;
  requestedBy: UserId;
  requestedAt: string;
  generatedAt: string | null;
  metrics: ReportMetrics | null;
  failureReason: string | null;
};

export function emptyMetrics(): ReportMetrics {
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
