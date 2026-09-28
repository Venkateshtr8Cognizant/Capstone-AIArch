import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError, } from '../../platform/errors/index.js';
import { canTransition, } from './programmes.types.js';
export class ProgrammeService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async listForStore(storeId) {
        return this.deps.repository.listByStore(storeId);
    }
    async findProgramme(programmeId) {
        return this.deps.repository.find(programmeId);
    }
    async list(principal) {
        return this.deps.repository.listByStore(principal.storeId);
    }
    async create(principal, input, correlationId) {
        if (principal.role === 'ASSOCIATE') {
            throw new AuthorizationError('Associates may not create programmes', {
                details: [{ path: 'role', message: 'requires DEPARTMENT_LEAD or above' }],
                correlationId,
            });
        }
        const now = this.deps.clock.nowIso();
        const project = {
            programmeId: this.deps.ids.next('prog'),
            storeId: principal.storeId,
            name: input.name,
            description: input.description ?? null,
            status: 'PLANNING',
            members: [{ userId: principal.userId, role: toProjectRole(principal.role), addedAt: now }],
            createdBy: principal.userId,
            createdAt: now,
            updatedAt: now,
        };
        await this.deps.repository.save(project);
        return project;
    }
    /** POST /api/programmes/:id/members */
    async addMember(principal, programmeId, input, correlationId) {
        const project = await this.loadOwnedProgramme(principal, programmeId);
        if (project.status === 'CLOSED') {
            throw new ConflictError(`Programme '${programmeId}' is closed`, { correlationId });
        }
        if (principal.role === 'ASSOCIATE') {
            throw new AuthorizationError('Associates may not change programme membership', {
                correlationId,
            });
        }
        // Read-only cross-module lookup through the staff public port.
        const user = await this.deps.staff.findUser(input.userId);
        if (!user) {
            throw new NotFoundError('User', input.userId, { correlationId });
        }
        if (user.storeId !== project.storeId) {
            throw new BusinessRuleError('PRG-1', `User '${input.userId}' works at store '${user.storeId}', not '${project.storeId}'`, {
                details: [{ path: 'userId', message: 'must work at the programme store', rule: 'PRG-1' }],
                correlationId,
            });
        }
        if (project.members.some((member) => member.userId === input.userId)) {
            throw new ConflictError(`User '${input.userId}' is already a member of '${programmeId}'`, {
                correlationId,
            });
        }
        const now = this.deps.clock.nowIso();
        const member = { userId: input.userId, role: input.role, addedAt: now };
        const updated = {
            ...project,
            members: [...project.members, member],
            status: project.status === 'PLANNING' && input.role === 'STORE_MANAGER' ? 'ACTIVE' : project.status,
            updatedAt: now,
        };
        await this.deps.repository.save(updated);
        await this.deps.events.publish([
            {
                type: 'programmes.member.added',
                actor: { type: 'user', id: principal.userId },
                correlationId,
                payload: {
                    programmeId: updated.programmeId,
                    storeId: updated.storeId,
                    userId: member.userId,
                    role: member.role,
                },
            },
        ]);
        return updated;
    }
    /**
     * POST /api/programmes/:id/close
     *
     * Beyond the nine base endpoints, and required by the SPEC 3.3 cross-module
     * example: closing a programme triggers a STORE_SUMMARY recompute in the
     * reports module — via the event bus, never by calling reports directly.
     */
    async close(principal, programmeId, correlationId) {
        const project = await this.loadOwnedProgramme(principal, programmeId);
        if (!canTransition(project.status, 'CLOSED')) {
            throw new ConflictError(`Programme '${programmeId}' is already closed`, { correlationId });
        }
        if (principal.role !== 'STORE_MANAGER' && principal.role !== 'REGIONAL_MANAGER') {
            throw new AuthorizationError('Only a store or regional manager may close a programme', {
                details: [{ path: 'role', message: 'requires STORE_MANAGER or above' }],
                correlationId,
            });
        }
        // Read-only cross-module lookup: how much work is still outstanding.
        const activities = await this.deps.activities.listForStore(project.storeId);
        const openTaskCountAtClose = activities.filter((task) => task.programmeId === programmeId && task.status !== 'DONE').length;
        const now = this.deps.clock.nowIso();
        const closed = { ...project, status: 'CLOSED', updatedAt: now };
        await this.deps.repository.save(closed);
        await this.deps.events.publish([
            {
                type: 'programmes.programme.closed',
                actor: { type: 'user', id: principal.userId },
                correlationId,
                payload: {
                    programmeId: closed.programmeId,
                    storeId: closed.storeId,
                    regionId: principal.regionId,
                    closedBy: principal.userId,
                    openTaskCountAtClose,
                },
            },
        ]);
        this.deps.logger.info('programmes.programme_closed', {
            programmeId,
            openTaskCountAtClose,
            correlationId,
        });
        return closed;
    }
    async loadOwnedProgramme(principal, programmeId) {
        const project = await this.deps.repository.find(programmeId);
        if (!project || project.storeId !== principal.storeId) {
            throw new NotFoundError('Programme', programmeId);
        }
        return project;
    }
}
function toProjectRole(role) {
    return role === 'REGIONAL_MANAGER' ? 'STORE_MANAGER' : role;
}
//# sourceMappingURL=programmes.service.js.map