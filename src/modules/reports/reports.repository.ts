import type { ReportType } from '../../contracts/events.js';
import type { ReportId } from '../../contracts/identity.js';
import type { Report } from './reports.types.js';

/** MODULE-PRIVATE. Only files inside `src/modules/reports/` may use this. */
export interface ReportRepository {
  find(reportId: ReportId): Promise<Report | null>;
  findLatest(type: ReportType, scopeId: string): Promise<Report | null>;
  listByScope(scopeId: string): Promise<Report[]>;
  save(report: Report): Promise<void>;
}

export class InMemoryReportRepository implements ReportRepository {
  private readonly reports = new Map<ReportId, Report>();

  async find(reportId: ReportId): Promise<Report | null> {
    const report = this.reports.get(reportId);
    return report ? structuredClone(report) : null;
  }

  async findLatest(type: ReportType, scopeId: string): Promise<Report | null> {
    const matches = [...this.reports.values()]
      .filter((report) => report.type === type && report.scopeId === scopeId)
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
    const latest = matches[0];
    return latest ? structuredClone(latest) : null;
  }

  async listByScope(scopeId: string): Promise<Report[]> {
    return [...this.reports.values()]
      .filter((report) => report.scopeId === scopeId)
      .map((report) => structuredClone(report));
  }

  async save(report: Report): Promise<void> {
    this.reports.set(report.reportId, structuredClone(report));
  }
}
