import type { DepartmentId, StoreId, UserId } from '../../contracts/identity.js';
import type { AuthToken, User, UserProfile } from './staff.types.js';

/**
 * MODULE-PRIVATE. Only files inside `src/modules/staff/` may reference this
 * port or its implementations.
 *
 * Sibling modules read staff data through `StaffReadPort`
 * (`src/modules/staff/index.ts`). Importing this file from another module is
 * failure mode F1 and a blocking finding under harness rule MB-1/MB-6.
 */
export interface StaffRepository {
  findUser(userId: UserId): Promise<User | null>;
  findProfile(userId: UserId): Promise<UserProfile | null>;
  findToken(token: string): Promise<AuthToken | null>;
  listByStore(storeId: StoreId): Promise<User[]>;
  listByDepartment(storeId: StoreId, departmentId: DepartmentId): Promise<User[]>;
  saveUser(user: User): Promise<void>;
  saveProfile(profile: UserProfile): Promise<void>;
  saveToken(token: AuthToken): Promise<void>;
}

export class InMemoryStaffRepository implements StaffRepository {
  private readonly users = new Map<UserId, User>();
  private readonly profiles = new Map<UserId, UserProfile>();
  private readonly tokens = new Map<string, AuthToken>();

  async findUser(userId: UserId): Promise<User | null> {
    const user = this.users.get(userId);
    return user ? { ...user } : null;
  }

  async findProfile(userId: UserId): Promise<UserProfile | null> {
    const profile = this.profiles.get(userId);
    return profile ? { ...profile } : null;
  }

  async findToken(token: string): Promise<AuthToken | null> {
    const found = this.tokens.get(token);
    return found ? { ...found } : null;
  }

  async listByStore(storeId: StoreId): Promise<User[]> {
    return [...this.users.values()].filter((user) => user.storeId === storeId).map((user) => ({ ...user }));
  }

  async listByDepartment(storeId: StoreId, departmentId: DepartmentId): Promise<User[]> {
    const profileIds = new Set(
      [...this.profiles.values()]
        .filter((profile) => profile.departmentId === departmentId)
        .map((profile) => profile.userId),
    );
    return [...this.users.values()]
      .filter((user) => user.storeId === storeId && profileIds.has(user.userId))
      .map((user) => ({ ...user }));
  }

  async saveUser(user: User): Promise<void> {
    this.users.set(user.userId, { ...user });
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    this.profiles.set(profile.userId, { ...profile });
  }

  async saveToken(token: AuthToken): Promise<void> {
    this.tokens.set(token.token, { ...token });
  }
}
