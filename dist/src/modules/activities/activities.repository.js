import { InternalError } from '../../platform/errors/index.js';
export class InMemoryActivityRepository {
    tasks = new Map();
    async find(taskId) {
        const task = this.tasks.get(taskId);
        return task ? structuredClone(task) : null;
    }
    async findMany(taskIds) {
        const found = [];
        for (const taskId of taskIds) {
            const task = this.tasks.get(taskId);
            if (task) {
                found.push(structuredClone(task));
            }
        }
        return found;
    }
    async list(filter) {
        return [...this.tasks.values()]
            .filter((task) => task.storeId === filter.storeId)
            .filter((task) => (filter.programmeId ? task.programmeId === filter.programmeId : true))
            .filter((task) => (filter.status ? task.status === filter.status : true))
            .map((task) => structuredClone(task))
            .sort((left, right) => left.taskId.localeCompare(right.taskId));
    }
    async listByStore(storeId) {
        return this.list({ storeId });
    }
    async save(task) {
        this.tasks.set(task.taskId, structuredClone(task));
    }
    /**
     * Stages the whole batch before committing, so a mid-batch failure leaves
     * the store untouched. A relational implementation wraps this in a single
     * transaction.
     */
    async saveMany(tasks) {
        const staged = tasks.map((task) => structuredClone(task));
        for (const task of staged) {
            if (!task.taskId) {
                throw new InternalError('A task without an id reached saveMany');
            }
        }
        for (const task of staged) {
            this.tasks.set(task.taskId, task);
        }
    }
    async remove(taskId) {
        this.tasks.delete(taskId);
    }
}
//# sourceMappingURL=activities.repository.js.map