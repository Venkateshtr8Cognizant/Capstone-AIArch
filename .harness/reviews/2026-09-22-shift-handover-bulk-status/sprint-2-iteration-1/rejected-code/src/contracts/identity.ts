// REJECTED ITERATION 1 — preserved as evidence. Do not copy.
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';

export type Principal = {
  userId: string;
  storeId: string;
  regionId: string;
  role: 'REGIONAL_MANAGER' | 'STORE_MANAGER' | 'DEPARTMENT_LEAD' | 'ASSOCIATE';
  departmentId: string | null;
};
