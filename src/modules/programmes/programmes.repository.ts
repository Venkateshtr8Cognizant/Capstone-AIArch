import type { ProgrammeId, StoreId } from '../../contracts/identity.js';
import type { Project } from './programmes.types.js';

/**
 * MODULE-PRIVATE. Only files inside `src/modules/programmes/` may reference
 * this port. Sibling modules use `ProgrammeReadPort` from `index.ts`.
 */
export interface ProgrammeRepository {
  find(programmeId: ProgrammeId): Promise<Project | null>;
  listByStore(storeId: StoreId): Promise<Project[]>;
  save(project: Project): Promise<void>;
}

export class InMemoryProgrammeRepository implements ProgrammeRepository {
  private readonly projects = new Map<ProgrammeId, Project>();

  async find(programmeId: ProgrammeId): Promise<Project | null> {
    const project = this.projects.get(programmeId);
    return project ? structuredClone(project) : null;
  }

  async listByStore(storeId: StoreId): Promise<Project[]> {
    return [...this.projects.values()]
      .filter((project) => project.storeId === storeId)
      .map((project) => structuredClone(project))
      .sort((left, right) => left.programmeId.localeCompare(right.programmeId));
  }

  async save(project: Project): Promise<void> {
    this.projects.set(project.programmeId, structuredClone(project));
  }
}
