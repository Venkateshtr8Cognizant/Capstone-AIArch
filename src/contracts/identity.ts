/**
 * Shared identity vocabulary.
 *
 * Lives in `src/contracts/` because the platform's auth middleware and every
 * module need it, and the platform layer must not import module code.
 * `src/contracts/**` is dependency-free by rule MB-3 of the harness gate.
 */

export type StoreId = string;
export type RegionId = string;
export type UserId = string;
export type DepartmentId = string;
export type TaskId = string;
export type ProgrammeId = string;
export type NotificationId = string;
export type ReportId = string;

/** SPEC 3.3 — staff module, StaffRole. */
export type StaffRole = 'REGIONAL_MANAGER' | 'STORE_MANAGER' | 'DEPARTMENT_LEAD' | 'ASSOCIATE';

export const STAFF_ROLES: readonly StaffRole[] = [
  'REGIONAL_MANAGER',
  'STORE_MANAGER',
  'DEPARTMENT_LEAD',
  'ASSOCIATE',
];

/**
 * The authenticated caller, resolved from an AuthToken by the staff module
 * and attached to the request by the platform auth middleware. Every route
 * authorises against this and never against raw request fields.
 */
export type Principal = {
  userId: UserId;
  storeId: StoreId;
  regionId: RegionId;
  role: StaffRole;
  departmentId: DepartmentId | null;
};

/** Actor recorded on audit entries and event envelopes. */
export type Actor = {
  type: 'user' | 'system';
  id: string;
};

export function isAtLeast(role: StaffRole, minimum: StaffRole): boolean {
  const rank: Record<StaffRole, number> = {
    ASSOCIATE: 0,
    DEPARTMENT_LEAD: 1,
    STORE_MANAGER: 2,
    REGIONAL_MANAGER: 3,
  };
  return rank[role] >= rank[minimum];
}
