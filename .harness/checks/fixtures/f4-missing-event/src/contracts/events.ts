export type StoreOpsEventMap = {
  /** Declared, documented in the spec — and never published. */
  'activities.bulk_status.completed': { bulkOperationId: string; storeId: string };
  'alerts.notification.created': { notificationId: string };
};

export type StoreOpsEventType = keyof StoreOpsEventMap;

export const EVENT_OWNERS: Record<StoreOpsEventType, 'activities' | 'alerts'> = {
  'activities.bulk_status.completed': 'activities',
  'alerts.notification.created': 'alerts',
};
