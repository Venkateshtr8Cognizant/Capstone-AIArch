export type StoreOpsEventMap = {
  'activities.task.created': { taskId: string };
};

export type StoreOpsEventType = keyof StoreOpsEventMap;

export const EVENT_OWNERS: Record<StoreOpsEventType, 'activities'> = {
  'activities.task.created': 'activities',
};
