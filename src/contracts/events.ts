/**
 * StoreOps published language — the event catalogue.
 *
 * SPEC 3.3 cross-module rules:
 *   1. a module MAY call another module's service layer for read-only
 *      lookups, through that module's public `index.ts` only;
 *   2. every cross-module SIDE EFFECT travels as one of the events below —
 *      never as a direct service-to-service write, and never as an import of
 *      a sibling module's repository.
 *
 * Rules for changing this file:
 *   - additive changes only within a major version;
 *   - a breaking payload change needs a new versioned type name
 *     (e.g. `activities.bulk_status.completed.v2`) and a deprecation window;
 *   - `src/contracts/**` stays dependency-free (harness rule MB-3).
 */
import type {
  DepartmentId,
  ProgrammeId,
  RegionId,
  StoreId,
  TaskId,
  UserId,
} from './identity.js';

/** SPEC 3.3 — activities module. */
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskCategory = 'RESTOCKING' | 'PLANOGRAM' | 'AUDIT' | 'COMPLIANCE' | 'GENERAL';

/** SPEC 3.3 — alerts module. */
export type AlertType = 'INVENTORY' | 'SLA_BREACH' | 'SHIFT_HANDOVER' | 'ESCALATION';

/** SPEC 3.3 — reports module. */
export type ReportType = 'STORE_SUMMARY' | 'REGIONAL_ROLLUP' | 'DEPARTMENT_PERFORMANCE';

// ---------------------------------------------------------------------------
// activities — published events
// ---------------------------------------------------------------------------

export type TaskCreatedPayload = {
  taskId: TaskId;
  storeId: StoreId;
  programmeId: ProgrammeId | null;
  departmentId: DepartmentId | null;
  assigneeId: UserId | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  dueAt: string | null;
};

export type TaskStatusChangedPayload = {
  taskId: TaskId;
  storeId: StoreId;
  departmentId: DepartmentId | null;
  assigneeId: UserId | null;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  dueAt: string | null;
  /** Set when the transition was part of a bulk shift handover. */
  bulkOperationId: string | null;
};

/**
 * Emitted once per bulk status update (shift handover), after the batch has
 * been persisted. Carries only the items that actually changed, because the
 * operation supports partial failure.
 */
export type BulkStatusCompletedPayload = {
  bulkOperationId: string;
  storeId: StoreId;
  requestedBy: UserId;
  targetStatus: Extract<TaskStatus, 'DONE' | 'BLOCKED'>;
  updated: Array<{
    taskId: TaskId;
    fromStatus: TaskStatus;
    priority: TaskPriority;
    category: TaskCategory;
    departmentId: DepartmentId | null;
    assigneeId: UserId | null;
  }>;
  /** Items rejected by a per-item rule; included so alerts can summarise. */
  failedCount: number;
  note: string | null;
};

// ---------------------------------------------------------------------------
// programmes — published events
// ---------------------------------------------------------------------------

export type ProgrammeMemberAddedPayload = {
  programmeId: ProgrammeId;
  storeId: StoreId;
  userId: UserId;
  role: 'STORE_MANAGER' | 'DEPARTMENT_LEAD' | 'ASSOCIATE';
};

export type ProgrammeClosedPayload = {
  programmeId: ProgrammeId;
  storeId: StoreId;
  regionId: RegionId;
  closedBy: UserId;
  openTaskCountAtClose: number;
};

// ---------------------------------------------------------------------------
// alerts — published events
// ---------------------------------------------------------------------------

export type NotificationCreatedPayload = {
  notificationId: string;
  userId: UserId;
  storeId: StoreId;
  type: AlertType;
  channel: 'IN_APP' | 'EMAIL';
  subject: string;
};

// ---------------------------------------------------------------------------
// reports — published events
// ---------------------------------------------------------------------------

export type ReportRequestedPayload = {
  reportId: string;
  type: ReportType;
  /** Store id for STORE_SUMMARY, region id for REGIONAL_ROLLUP. */
  scopeId: string;
  requestedBy: UserId;
  reason: 'programme_closed' | 'bulk_status_completed' | 'on_demand';
};

/**
 * The event map. Adding a cross-module channel means adding a line here,
 * which makes every new channel visible in code review, to the Evaluator,
 * and to the harness event check.
 */
export type StoreOpsEventMap = {
  'activities.task.created': TaskCreatedPayload;
  'activities.task.status_changed': TaskStatusChangedPayload;
  'activities.bulk_status.completed': BulkStatusCompletedPayload;
  'programmes.member.added': ProgrammeMemberAddedPayload;
  'programmes.programme.closed': ProgrammeClosedPayload;
  'alerts.notification.created': NotificationCreatedPayload;
  'reports.report.requested': ReportRequestedPayload;
};

export type StoreOpsEventType = keyof StoreOpsEventMap;

export type StoreOpsModule = 'activities' | 'programmes' | 'staff' | 'alerts' | 'reports';

/**
 * Which module owns — and is therefore the only module allowed to publish —
 * each event type. The harness event check reads this map to prove that no
 * module publishes another module's events.
 */
export const EVENT_OWNERS: Record<StoreOpsEventType, StoreOpsModule> = {
  'activities.task.created': 'activities',
  'activities.task.status_changed': 'activities',
  'activities.bulk_status.completed': 'activities',
  'programmes.member.added': 'programmes',
  'programmes.programme.closed': 'programmes',
  'alerts.notification.created': 'alerts',
  'reports.report.requested': 'reports',
};

export const STOREOPS_EVENT_TYPES = Object.keys(EVENT_OWNERS) as StoreOpsEventType[];
