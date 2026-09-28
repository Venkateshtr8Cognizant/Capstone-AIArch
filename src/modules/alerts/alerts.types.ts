import type { AlertType } from '../../contracts/events.js';
import type { NotificationId, StoreId, UserId } from '../../contracts/identity.js';

/** SPEC 3.3 — alerts module key types. */

export type NotificationChannel = 'IN_APP' | 'EMAIL';

export type NotificationStatus = 'PENDING' | 'SENT' | 'READ' | 'FAILED';

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ['IN_APP', 'EMAIL'];
export const NOTIFICATION_STATUSES: readonly NotificationStatus[] = [
  'PENDING',
  'SENT',
  'READ',
  'FAILED',
];

export type Notification = {
  notificationId: NotificationId;
  userId: UserId;
  storeId: StoreId;
  type: AlertType;
  channel: NotificationChannel;
  status: NotificationStatus;
  subject: string;
  body: string;
  /** Correlation id of the request whose event produced this alert. */
  correlationId: string;
  createdAt: string;
  /** Event that caused this notification, for traceability. */
  sourceEventId: string | null;
};

/**
 * Channel routing policy: escalations and SLA breaches reach people by email,
 * routine handover summaries stay in-app.
 */
export function channelFor(type: AlertType): NotificationChannel {
  return type === 'SLA_BREACH' || type === 'ESCALATION' ? 'EMAIL' : 'IN_APP';
}
