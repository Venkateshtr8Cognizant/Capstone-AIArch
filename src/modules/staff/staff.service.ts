import type {
  DepartmentId,
  Principal,
  StoreId,
  UserId,
} from '../../contracts/identity.js';
import { NotFoundError } from '../../platform/errors/index.js';
import type { Clock } from '../../platform/support/clock.js';
import type { Logger } from '../../platform/support/logger.js';
import type { StaffRepository } from './staff.repository.js';
import type { AuthToken, User, UserProfile } from './staff.types.js';

/**
 * The staff module's public READ port.
 *
 * SPEC 3.3 cross-module rule 1 allows sibling modules to call another
 * module's service layer for read-only lookups. This interface is that
 * permitted surface, and it is deliberately read-only: a module that needs
 * staff state to change publishes an event instead. `staff` is read-only for
 * every other module — it never has writes performed on its behalf.
 */
export interface StaffReadPort {
  resolveToken(token: string): Promise<Principal | null>;
  findUser(userId: UserId): Promise<User | null>;
  getUser(userId: UserId): Promise<User>;
  findProfile(userId: UserId): Promise<UserProfile | null>;
  /** Department lead for escalation targeting (alerts module). */
  findDepartmentLead(storeId: StoreId, departmentId: DepartmentId): Promise<User | null>;
  /** Store managers for escalation targeting (alerts module). */
  listStoreManagers(storeId: StoreId): Promise<User[]>;
  listByStore(storeId: StoreId): Promise<User[]>;
}

export class StaffService implements StaffReadPort {
  constructor(
    private readonly deps: {
      repository: StaffRepository;
      clock: Clock;
      logger: Logger;
    },
  ) {}

  // -- public read port --------------------------------------------------

  /**
   * Validates a bearer token and projects the user onto a `Principal`.
   * The only place in StoreOps where a token becomes an identity.
   */
  async resolveToken(token: string): Promise<Principal | null> {
    const found = await this.deps.repository.findToken(token);
    if (!found) {
      return null;
    }
    if (new Date(found.expiresAt).getTime() <= this.deps.clock.now().getTime()) {
      this.deps.logger.warn('staff.token_expired', { userId: found.userId });
      return null;
    }

    const user = await this.deps.repository.findUser(found.userId);
    if (!user || !user.active) {
      this.deps.logger.warn('staff.token_user_inactive', { userId: found.userId });
      return null;
    }

    const profile = await this.deps.repository.findProfile(user.userId);
    return {
      userId: user.userId,
      storeId: user.storeId,
      regionId: user.regionId,
      role: user.role,
      departmentId: profile?.departmentId ?? null,
    };
  }

  async findUser(userId: UserId): Promise<User | null> {
    return this.deps.repository.findUser(userId);
  }

  async getUser(userId: UserId): Promise<User> {
    const user = await this.deps.repository.findUser(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    return user;
  }

  async findProfile(userId: UserId): Promise<UserProfile | null> {
    return this.deps.repository.findProfile(userId);
  }

  async findDepartmentLead(storeId: StoreId, departmentId: DepartmentId): Promise<User | null> {
    const candidates = await this.deps.repository.listByDepartment(storeId, departmentId);
    return candidates.find((user) => user.role === 'DEPARTMENT_LEAD' && user.active) ?? null;
  }

  async listStoreManagers(storeId: StoreId): Promise<User[]> {
    const users = await this.deps.repository.listByStore(storeId);
    return users.filter((user) => user.role === 'STORE_MANAGER' && user.active);
  }

  async listByStore(storeId: StoreId): Promise<User[]> {
    return this.deps.repository.listByStore(storeId);
  }

  // -- provisioning ------------------------------------------------------
  // Used by the seed script and tests. Tokens originate from the client's
  // identity provider; StoreOps stores no credentials.

  async provisionUser(input: {
    user: User;
    profile?: Omit<UserProfile, 'userId'>;
    token?: { token: string; ttlMinutes?: number };
  }): Promise<void> {
    await this.deps.repository.saveUser(input.user);
    if (input.profile) {
      await this.deps.repository.saveProfile({ userId: input.user.userId, ...input.profile });
    }
    if (input.token) {
      const ttl = (input.token.ttlMinutes ?? 8 * 60) * 60 * 1000;
      const authToken: AuthToken = {
        token: input.token.token,
        userId: input.user.userId,
        expiresAt: new Date(this.deps.clock.now().getTime() + ttl).toISOString(),
      };
      await this.deps.repository.saveToken(authToken);
    }
  }
}
