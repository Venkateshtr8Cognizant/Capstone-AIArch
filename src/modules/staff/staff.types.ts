import type {
  DepartmentId,
  RegionId,
  StaffRole,
  StoreId,
  UserId,
} from '../../contracts/identity.js';

/** SPEC 3.3 — staff module key types. */

export type User = {
  userId: UserId;
  storeId: StoreId;
  regionId: RegionId;
  email: string;
  role: StaffRole;
  active: boolean;
};

export type UserProfile = {
  userId: UserId;
  displayName: string;
  departmentId: DepartmentId | null;
  /** Shift the colleague is currently rostered on, when on shift. */
  currentShiftId: string | null;
};

/**
 * Tokens are issued by the client's identity provider and provisioned into
 * StoreOps; the staff module validates them but never owns credentials.
 * That is why staff has no CRUD surface (SPEC 3.6).
 */
export type AuthToken = {
  token: string;
  userId: UserId;
  expiresAt: string;
};
