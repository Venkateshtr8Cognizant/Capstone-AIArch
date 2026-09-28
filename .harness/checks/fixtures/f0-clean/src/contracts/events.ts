export type StoreOpsEventMap = {
  'activities.task.created': { taskId: string; storeId: string };
};

export type StoreOpsEventType = keyof StoreOpsEventMap;

export const EVENT_OWNERS: Record<StoreOpsEventType, 'activities' | 'alerts'> = {
  'activities.task.created': 'activities',
};
