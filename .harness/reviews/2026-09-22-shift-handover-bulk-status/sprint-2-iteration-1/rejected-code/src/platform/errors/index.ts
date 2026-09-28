// REJECTED ITERATION 1 — preserved as evidence. Do not copy.
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly isOperational: boolean = true;
}

export class ValidationError extends AppError {
  readonly code = 'VALIDATION_FAILED';
  readonly statusCode = 400;
}

export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;
}

export class BusinessRuleError extends AppError {
  readonly code = 'BUSINESS_RULE_VIOLATION';
  readonly statusCode = 422;
  readonly rule: string;

  constructor(rule: string, message: string) {
    super(message);
    this.rule = rule;
  }
}
