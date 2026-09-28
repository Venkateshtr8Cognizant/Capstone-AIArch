type EventBus = {
  subscribe(type: string, name: string, handler: (event: unknown) => void): void;
};

/** A correctly located and correctly named subscriber. */
export function registerActivitySubscribers(deps: { events: EventBus }): void {
  deps.events.subscribe('activities.task.created', 'activities.audit-trail', () => {
    // Records the creation in this module's own audit projection.
  });
}
