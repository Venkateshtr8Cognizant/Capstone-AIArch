export type StoreOpsEventMap = {
  'activities.bulk_status.completed': { bulkOperationId: string; storeId: string };
};

export type StoreOpsEventType = keyof StoreOpsEventMap;

export const EVENT_OWNERS: Record<StoreOpsEventType, 'activities' | 'alerts'> = {
  'activities.bulk_status.completed': 'activities',
};
