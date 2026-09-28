import type { StoreOps } from './app.js';

/**
 * Demonstration seed data for a single store day.
 *
 * Tokens stand in for tokens issued by the client's identity provider — the
 * staff module validates them and StoreOps stores no credentials (SPEC 3.6,
 * staff is auth-only). Used by the local Docker run and the smoke script;
 * tests build their own fixture with the same shape.
 */

export const STORE_ID = 'store_401';
export const REGION_ID = 'region_north';
export const DEPT_GROCERY = 'dept_grocery';
export const DEPT_CHILLED = 'dept_chilled';

export const USERS = {
  regionalManager: { userId: 'user_rhona', token: 'token-rhona-regional' },
  storeManager: { userId: 'user_sam', token: 'token-sam-manager' },
  groceryLead: { userId: 'user_priya', token: 'token-priya-lead' },
  chilledLead: { userId: 'user_marcus', token: 'token-marcus-lead' },
  associateEarly: { userId: 'user_alice', token: 'token-alice-associate' },
  associateLate: { userId: 'user_chen', token: 'token-chen-associate' },
} as const;

export async function seedDemoData(ops: StoreOps): Promise<void> {
  const staff = ops.staff.service;

  await staff.provisionUser({
    user: {
      userId: USERS.regionalManager.userId,
      storeId: STORE_ID,
      regionId: REGION_ID,
      email: 'rhona@retail.example',
      role: 'REGIONAL_MANAGER',
      active: true,
    },
    profile: { displayName: 'Rhona', departmentId: null, currentShiftId: null },
    token: { token: USERS.regionalManager.token },
  });

  await staff.provisionUser({
    user: {
      userId: USERS.storeManager.userId,
      storeId: STORE_ID,
      regionId: REGION_ID,
      email: 'sam@retail.example',
      role: 'STORE_MANAGER',
      active: true,
    },
    profile: { displayName: 'Sam', departmentId: null, currentShiftId: null },
    token: { token: USERS.storeManager.token },
  });

  await staff.provisionUser({
    user: {
      userId: USERS.groceryLead.userId,
      storeId: STORE_ID,
      regionId: REGION_ID,
      email: 'priya@retail.example',
      role: 'DEPARTMENT_LEAD',
      active: true,
    },
    profile: { displayName: 'Priya', departmentId: DEPT_GROCERY, currentShiftId: 'shift_early' },
    token: { token: USERS.groceryLead.token },
  });

  await staff.provisionUser({
    user: {
      userId: USERS.chilledLead.userId,
      storeId: STORE_ID,
      regionId: REGION_ID,
      email: 'marcus@retail.example',
      role: 'DEPARTMENT_LEAD',
      active: true,
    },
    profile: { displayName: 'Marcus', departmentId: DEPT_CHILLED, currentShiftId: 'shift_late' },
    token: { token: USERS.chilledLead.token },
  });

  await staff.provisionUser({
    user: {
      userId: USERS.associateEarly.userId,
      storeId: STORE_ID,
      regionId: REGION_ID,
      email: 'alice@retail.example',
      role: 'ASSOCIATE',
      active: true,
    },
    profile: { displayName: 'Alice', departmentId: DEPT_GROCERY, currentShiftId: 'shift_early' },
    token: { token: USERS.associateEarly.token },
  });

  await staff.provisionUser({
    user: {
      userId: USERS.associateLate.userId,
      storeId: STORE_ID,
      regionId: REGION_ID,
      email: 'chen@retail.example',
      role: 'ASSOCIATE',
      active: true,
    },
    profile: { displayName: 'Chen', departmentId: DEPT_CHILLED, currentShiftId: 'shift_late' },
    token: { token: USERS.associateLate.token },
  });

  // A colleague at another store, used to prove the cross-store rule (BR-5).
  await staff.provisionUser({
    user: {
      userId: 'user_erin',
      storeId: 'store_902',
      regionId: REGION_ID,
      email: 'erin@retail.example',
      role: 'STORE_MANAGER',
      active: true,
    },
    profile: { displayName: 'Erin', departmentId: null, currentShiftId: null },
    token: { token: 'token-erin-other-store' },
  });
}
