import type { EventBus } from '../../platform/events/event-bus.js';
import type { Logger } from '../../platform/support/logger.js';
import type { ReportService } from './reports.service.js';

/**
 * Reports-side reactions to programmes and activities events.
 *
 * SPEC 3.3 cross-module example: "triggering a STORE_SUMMARY recompute when
 * a programme closes". The trigger arrives as an event; neither programmes
 * nor activities calls into reports, and neither writes a Report record.
 */
export function registerReportSubscribers(deps: {
  events: EventBus;
  service: ReportService;
  logger: Logger;
}): void {
  deps.events.subscribe(
    'programmes.programme.closed',
    'reports.store-summary-on-close',
    async (event) => {
      const report = await deps.service.request({
        type: 'STORE_SUMMARY',
        scopeId: event.payload.storeId,
        requestedBy: event.payload.closedBy,
        reason: 'programme_closed',
        correlationId: event.correlationId,
      });

      await deps.service.generateStoreSummary(report.reportId, event.correlationId);

      deps.logger.info('reports.recompute_on_programme_closed', {
        programmeId: event.payload.programmeId,
        reportId: report.reportId,
        openTaskCountAtClose: event.payload.openTaskCountAtClose,
        correlationId: event.correlationId,
      });
    },
  );

  /**
   * A shift handover changes completion figures, so the store summary is
   * recomputed. Requested and generated inside reports, from data read
   * through the activities public port.
   */
  deps.events.subscribe(
    'activities.bulk_status.completed',
    'reports.store-summary-on-handover',
    async (event) => {
      if (event.payload.updated.length === 0) {
        return;
      }

      const report = await deps.service.request({
        type: 'STORE_SUMMARY',
        scopeId: event.payload.storeId,
        requestedBy: event.payload.requestedBy,
        reason: 'bulk_status_completed',
        correlationId: event.correlationId,
      });

      await deps.service.generateStoreSummary(report.reportId, event.correlationId);

      deps.logger.info('reports.recompute_on_bulk_status', {
        bulkOperationId: event.payload.bulkOperationId,
        reportId: report.reportId,
        updatedCount: event.payload.updated.length,
        correlationId: event.correlationId,
      });
    },
  );
}
