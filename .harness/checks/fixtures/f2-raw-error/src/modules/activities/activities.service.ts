// FIXTURE — FAILURE MODE F2 (deliberate violations, do not copy).
//
// Every throw site here loses something the API contract depends on: the
// machine-readable code, the HTTP status mapping, the operational flag, or
// the business rule id. The error middleware can only turn these into a
// generic 500.
import { BusinessRuleError } from '../../platform/errors/index.js';

type Task = { taskId: string; storeId: string; status: string };

export class ActivityService {
  async bulkUpdateStatus(taskIds: string[], targetStatus: string): Promise<void> {
    // EH-1: raw Error in a service method.
    if (taskIds.length === 0) {
      throw new Error('taskIds must not be empty');
    }

    // EH-1: a different native error, same problem.
    if (taskIds.length > 50) {
      throw new RangeError('too many ids');
    }

    // EH-2: throwing a non-Error value.
    if (targetStatus !== 'DONE' && targetStatus !== 'BLOCKED') {
      throw 'targetStatus must be DONE or BLOCKED';
    }

    // EH-5: BusinessRuleError without a rule id in first position.
    if (targetStatus === 'BLOCKED') {
      throw new BusinessRuleError('a note is required when blocking work');
    }

    try {
      await this.persist(taskIds);
    } catch {
      // EH-3: the failure disappears.
    }
  }

  private async persist(taskIds: string[]): Promise<void> {
    void taskIds;
  }
}
