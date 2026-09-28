// FIXTURE — FAILURE MODE F4 (deliberate violation, do not copy).
//
// The subscriber is registered in the service file rather than
// `alerts.subscribers.ts`, and its name does not identify the owning module,
// so a dead-letter log line cannot be traced back to a module (EV-3).
type EventBus = {
  subscribe(type: string, name: string, handler: (event: unknown) => void): void;
};

export class AlertService {
  constructor(private readonly deps: { events: EventBus }) {
    this.deps.events.subscribe('alerts.notification.created', 'handler1', () => {
      // ...
    });
  }
}
