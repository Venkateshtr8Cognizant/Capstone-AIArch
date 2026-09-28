import type { ReportType, TaskCategory } from '../../contracts/events.js';
import type { ReportId, StoreId, UserId } from '../../contracts/identity.js';
import { NotFoundError } from '../../platform/errors/index.js';
import type { EventBus } from '../../platform/events/event-bus.js';
import type { Clock } from '../../platform/support/clock.js';
import type { IdGenerator } from '../../platform/support/ids.js';
import type { Logger } from '../../platform/support/logger.js';
import type { ActivityReadPort } from '../activities/index.js';
import type { ProgrammeReadPort } from '../programmes/index.js';
import type { ReportRepository } from './reports.repository.js';
import { emptyMetrics, type Report, type ReportMetrics } from './reports.types.js';

/**
 * reports service layer.
 *
 * reports is READ-ONLY with respect to every other module (SPEC 3.3): it
 * aggregates activities, programmes and staff data through their public read
 * ports and never writes to them. Its own Report records are the only state
 * it owns.
 */
export class ReportService {
  constructor(
    private readonly deps: {
      repository: ReportRepository;
      activities: ActivityReadPort;
      programmes: ProgrammeReadPort;
      events: EventBus;
      clock: Clock;
      ids: IdGenerator;
      logger: Logger;
    },
  ) {}

  async get(reportId: ReportId): Promise<Report> {
    const report = await this.deps.repository.find(reportId);
    if (!report) {
      throw new NotFoundError('Report', reportId);
    }
    return report;
  }

  async findLatest(type: ReportType, scopeId: string): Promise<Report | null> {
    return this.deps.repository.findLatest(type, scopeId);
  }

  /**
   * Records a report request and publishes `reports.report.requested`.
   * Called by this module's own subscribers and (later) by its routes.
   */
  async request(input: {
    type: ReportType;
    scopeId: string;
    requestedBy: UserId;
    reason: 'programme_closed' | 'bulk_status_completed' | 'on_demand';
    correlationId: string;
  }): Promise<Report> {
    const report: Report = {
      reportId: this.deps.ids.next('rep'),
      type: input.type,
      scopeId: input.scopeId,
      status: 'PENDING',
      requestedBy: input.requestedBy,
      requestedAt: this.deps.clock.nowIso(),
      generatedAt: null,
      metrics: null,
      failureReason: null,
    };

    await this.deps.repository.save(report);
    await this.deps.events.publish([
      {
        type: 'reports.report.requested',
        actor: { type: 'system', id: 'reports' },
        correlationId: input.correlationId,
        payload: {
          reportId: report.reportId,
          type: report.type,
          scopeId: report.scopeId,
          requestedBy: report.requestedBy,
          reason: input.reason,
        },
      },
    ]);

    this.deps.logger.info('reports.report_requested', {
      reportId: report.reportId,
      type: report.type,
      scopeId: report.scopeId,
      reason: input.reason,
      correlationId: input.correlationId,
    });

    return report;
  }

  /**
   * Computes a STORE_SUMMARY from the activities and programmes read ports
   * and marks the report READY.
   */
  async generateStoreSummary(reportId: ReportId, correlationId: string): Promise<Report> {
    const report = await this.get(reportId);
    const storeId: StoreId = report.scopeId;

    try {
      const activities = await this.deps.activities.listForStore(storeId);
      const programmes = await this.deps.programmes.listForStore(storeId);
      const metrics = summarise(
        activities.map((activity) => ({
          taskId: activity.taskId,
          status: activity.status,
          category: activity.category,
          dueAt: activity.dueAt,
        })),
        this.deps.clock.now(),
      );

      const ready: Report = {
        ...report,
        status: 'READY',
        generatedAt: this.deps.clock.nowIso(),
        metrics,
      };
      await this.deps.repository.save(ready);

      this.deps.logger.info('reports.store_summary_ready', {
        reportId,
        storeId,
        programmeCount: programmes.length,
        totalActivities: metrics.totalActivities,
        completionRate: metrics.completionRate,
        correlationId,
      });

      return ready;
    } catch (error) {
      const failed: Report = {
        ...report,
        status: 'FAILED',
        failureReason: error instanceof Error ? error.message : String(error),
      };
      await this.deps.repository.save(failed);
      this.deps.logger.error('reports.store_summary_failed', {
        reportId,
        storeId,
        reason: failed.failureReason,
        correlationId,
      });
      return failed;
    }
  }
}

/** Pure aggregation, so the figures can be unit-tested without a store. */
export function summarise(
  activities: ReadonlyArray<{
    taskId: string;
    status: string;
    category: TaskCategory;
    dueAt: string | null;
  }>,
  now: Date,
): ReportMetrics {
  const metrics = emptyMetrics();
  metrics.totalActivities = activities.length;

  for (const activity of activities) {
    if (activity.status === 'DONE') {
      metrics.completedActivities += 1;
    }
    if (activity.status === 'BLOCKED') {
      metrics.blockedActivities += 1;
      metrics.blockedTaskIds.push(activity.taskId);
    }
    const isOverdue =
      activity.status !== 'DONE' &&
      activity.dueAt !== null &&
      new Date(activity.dueAt).getTime() < now.getTime();
    if (isOverdue) {
      metrics.overdueByCategory[activity.category] += 1;
    }
  }

  metrics.completionRate =
    metrics.totalActivities === 0
      ? 0
      : Math.round((metrics.completedActivities / metrics.totalActivities) * 1000) / 1000;
  metrics.blockedTaskIds.sort();

  return metrics;
}
