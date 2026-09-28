import type { EventBus } from '../../platform/events/event-bus.js';
import type { Logger } from '../../platform/support/logger.js';
import type { StaffReadPort } from '../staff/index.js';
import type { AlertService } from './alerts.service.js';

/**
 * Alerts-side reactions to activities events.
 *
 * These subscribers are the reason the activities module never writes to the
 * alerts repository (SPEC 3.3 cross-module rule 2, failure mode F4):
 * activities publishes, and the notification is created here, inside the
 * module that owns notification state.
 *
 * Escalation targeting uses the staff READ port — a permitted cross-module
 * read-only lookup (rule 1).
 */
export function registerAlertSubscribers(deps: {
  events: EventBus;
  service: AlertService;
  staff: StaffReadPort;
  logger: Logger;
}): void {
  /**
   * A HIGH or CRITICAL activity that becomes BLOCKED is escalated to the
   * department lead, falling back to a store manager when the department has
   * no lead rostered.
   */
  deps.events.subscribe(
    'activities.task.status_changed',
    'alerts.blocked-escalation',
    async (event) => {
      const { toStatus, priority, departmentId, storeId, taskId } = event.payload;
      if (toStatus !== 'BLOCKED') return;
      if (priority !== 'HIGH' && priority !== 'CRITICAL') return;

      const recipient = await resolveEscalationTarget(deps.staff, storeId, departmentId);
      if (!recipient) {
        deps.logger.warn('alerts.escalation_unroutable', {
          taskId,
          storeId,
          departmentId,
          correlationId: event.correlationId,
        });
        return;
      }

      await deps.service.raise({
        userId: recipient,
        storeId,
        type: 'ESCALATION',
        subject: `${priority} activity blocked: ${taskId}`,
        body: `Activity ${taskId} moved from ${event.payload.fromStatus} to BLOCKED and needs intervention.`,
        correlationId: event.correlationId,
        sourceEventId: event.eventId,
      });
    },
  );

  /**
   * A completed shift handover raises one SHIFT_HANDOVER summary per store
   * manager, so the incoming shift sees what was closed and what was left
   * blocked.
   */
  deps.events.subscribe(
    'activities.bulk_status.completed',
    'alerts.handover-summary',
    async (event) => {
      const { storeId, targetStatus, updated, failedCount, requestedBy, bulkOperationId } =
        event.payload;

      const managers = await deps.staff.listStoreManagers(storeId);
      if (managers.length === 0) {
        deps.logger.warn('alerts.handover_summary_unroutable', {
          bulkOperationId,
          storeId,
          correlationId: event.correlationId,
        });
        return;
      }

      const blockedNote = targetStatus === 'BLOCKED' ? ` Blocker: ${event.payload.note ?? 'not stated'}.` : '';

      for (const manager of managers) {
        await deps.service.raise({
          userId: manager.userId,
          storeId,
          type: 'SHIFT_HANDOVER',
          subject: `Shift handover: ${updated.length} activity(ies) set to ${targetStatus}`,
          body:
            `${requestedBy} set ${updated.length} activity(ies) to ${targetStatus} in handover ` +
            `${bulkOperationId}; ${failedCount} item(s) were rejected.${blockedNote}`,
          correlationId: event.correlationId,
          sourceEventId: event.eventId,
        });
      }

      deps.logger.info('alerts.handover_summary_raised', {
        bulkOperationId,
        recipientCount: managers.length,
        correlationId: event.correlationId,
      });
    },
  );
}

async function resolveEscalationTarget(
  staff: StaffReadPort,
  storeId: string,
  departmentId: string | null,
): Promise<string | null> {
  if (departmentId) {
    const lead = await staff.findDepartmentLead(storeId, departmentId);
    if (lead) {
      return lead.userId;
    }
  }
  const managers = await staff.listStoreManagers(storeId);
  return managers[0]?.userId ?? null;
}
