export class InMemoryAlertRepository {
    notifications = new Map();
    async save(notification) {
        this.notifications.set(notification.notificationId, { ...notification });
    }
    async listForUser(userId) {
        return [...this.notifications.values()]
            .filter((notification) => notification.userId === userId)
            .map((notification) => ({ ...notification }))
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }
    async find(notificationId) {
        const notification = this.notifications.get(notificationId);
        return notification ? { ...notification } : null;
    }
}
//# sourceMappingURL=alerts.repository.js.map