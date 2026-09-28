export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
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
