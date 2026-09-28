export class InMemoryReportRepository {
    reports = new Map();
    async find(reportId) {
        const report = this.reports.get(reportId);
        return report ? structuredClone(report) : null;
    }
    async findLatest(type, scopeId) {
        const matches = [...this.reports.values()]
            .filter((report) => report.type === type && report.scopeId === scopeId)
            .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
        const latest = matches[0];
        return latest ? structuredClone(latest) : null;
    }
    async listByScope(scopeId) {
        return [...this.reports.values()]
            .filter((report) => report.scopeId === scopeId)
            .map((report) => structuredClone(report));
    }
    async save(report) {
        this.reports.set(report.reportId, structuredClone(report));
    }
}
//# sourceMappingURL=reports.repository.js.map