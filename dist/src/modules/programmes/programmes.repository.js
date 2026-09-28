export class InMemoryProgrammeRepository {
    projects = new Map();
    async find(programmeId) {
        const project = this.projects.get(programmeId);
        return project ? structuredClone(project) : null;
    }
    async listByStore(storeId) {
        return [...this.projects.values()]
            .filter((project) => project.storeId === storeId)
            .map((project) => structuredClone(project))
            .sort((left, right) => left.programmeId.localeCompare(right.programmeId));
    }
    async save(project) {
        this.projects.set(project.programmeId, structuredClone(project));
    }
}
//# sourceMappingURL=programmes.repository.js.map