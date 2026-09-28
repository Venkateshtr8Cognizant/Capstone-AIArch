import type { ProgrammeId, StoreId, UserId } from '../../contracts/identity.js';

/** SPEC 3.3 — programmes module key types. */

export type ProjectRole = 'STORE_MANAGER' | 'DEPARTMENT_LEAD' | 'ASSOCIATE';

export const PROJECT_ROLES: readonly ProjectRole[] = [
  'STORE_MANAGER',
  'DEPARTMENT_LEAD',
  'ASSOCIATE',
];

export type ProjectMember = {
  userId: UserId;
  role: ProjectRole;
  addedAt: string;
};

export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'CLOSED';

export type Project = {
  programmeId: ProgrammeId;
  storeId: StoreId;
  name: string;
  description: string | null;
  status: ProjectStatus;
  members: ProjectMember[];
  createdBy: UserId;
  createdAt: string;
  updatedAt: string;
};

export const PROJECT_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  PLANNING: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['CLOSED'],
  CLOSED: [],
};

/** A programme needs a store manager on it before it can go live. */
export const REQUIRED_ROLE_TO_ACTIVATE: ProjectRole = 'STORE_MANAGER';

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return PROJECT_TRANSITIONS[from].includes(to);
}
