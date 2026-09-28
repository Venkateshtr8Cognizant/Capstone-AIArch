// REJECTED ITERATION 1 — preserved as evidence. Do not copy.
import type { TaskStatus } from './identity.js';

export type BulkStatusCompletedPayload = {
  bulkOperationId: string;
  storeId: string;
  requestedBy: string;
  targetStatus: 'DONE' | 'BLOCKED';
  updated: Array<{ taskId: string; fromStatus: TaskStatus }>;
  failedCount: number;
  note: string | null;
};

export type NotificationCreatedPayload = {
  notificationId: string;
  userId: string;
  storeId: string;
  type: 'SHIFT_HANDOVER' | 'ESCALATION';
};

export type StoreOpsEventMap = {
  // Declared in the sprint 2 contract as BR-10 — and never published below.
  'activities.bulk_status.completed': BulkStatusCompletedPayload;
  'alerts.notification.created': NotificationCreatedPayload;
};

export type StoreOpsEventType = keyof StoreOpsEventMap;

export const EVENT_OWNERS: Record<StoreOpsEventType, 'activities' | 'alerts'> = {
  'activities.bulk_status.completed': 'activities',
  'alerts.notification.created': 'alerts',
};
