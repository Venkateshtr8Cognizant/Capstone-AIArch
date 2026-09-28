import { NotFoundError } from '../../platform/errors/index.js';
import { channelFor } from './alerts.types.js';
export class AlertService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    /** GET /api/alerts — alerts for the authenticated user. */
    async listForPrincipal(principal) {
        return this.deps.repository.listForUser(principal.userId);
    }
    async listForUser(userId) {
        return this.deps.repository.listForUser(userId);
    }
    async get(notificationId) {
        const notification = await this.deps.repository.find(notificationId);
        if (!notification) {
            throw new NotFoundError('Notification', notificationId);
        }
        return notification;
    }
    /**
     * Creates a notification. Called by this module's own subscribers (and its
     * routes), never by a sibling module: alerts state changes only in
     * reaction to an event the alerts module consumes.
     */
    async raise(input) {
        const notification = {
            notificationId: this.deps.ids.next('notif'),
            userId: input.userId,
            storeId: input.storeId,
            type: input.type,
            channel: channelFor(input.type),
            status: 'PENDING',
            subject: input.subject,
            body: input.body,
            correlationId: input.correlationId,
            createdAt: this.deps.clock.nowIso(),
            sourceEventId: input.sourceEventId ?? null,
        };
        await this.deps.repository.save(notification);
        await this.deps.events.publish([
            {
                type: 'alerts.notification.created',
                actor: { type: 'system', id: 'alerts' },
                correlationId: input.correlationId,
                payload: {
                    notificationId: notification.notificationId,
                    userId: notification.userId,
                    storeId: notification.storeId,
                    type: notification.type,
                    channel: notification.channel,
                    subject: notification.subject,
                },
            },
        ]);
        this.deps.logger.info('alerts.notification_raised', {
            notificationId: notification.notificationId,
            type: notification.type,
            channel: notification.channel,
            userId: notification.userId,
            correlationId: input.correlationId,
        });
        return notification;
    }
}
//# sourceMappingURL=alerts.service.js.map