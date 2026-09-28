/**
 * CHECK 2 — typed error hierarchy.
 *
 * Targets failure mode F2: "raw Error throws in service methods, bypassing
 * the project's typed AppError hierarchy".
 *
 * Rules
 *   EH-1  Every `throw new X(...)` in src/** must throw an AppError subclass.
 *         The allowed set is discovered from the source, so adding a new
 *         subclass needs no change to this check.
 *   EH-2  No throwing of non-Error values (`throw 'string'`, `throw {...}`).
 *   EH-3  No empty catch block — a swallowed error loses the failure.
 *   EH-4  Route files must not build 4xx/5xx responses by hand; errors go to
 *         the error middleware, which owns the wire format.
 *   EH-5  BusinessRuleError must receive a rule id as its first argument, so
 *         the rule reaches the API response and the tests.
 *   EH-6  `console.*` is not a logging strategy (advisory).
 *   EH-7  A service must not swallow an error by returning null/undefined
 *         from a catch block (advisory) — it hides failures from callers.
 */
import { join } from 'node:path';
import {
  finding,
  isMain,
  lineOf,
  listFiles,
  readSource,
  runAsCli,
  stripComments,
  toRel,
} from './lib/scan.mjs';

/** Native error types that must never cross a service boundary. */
const NATIVE_ERRORS = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'EvalError',
  'ReferenceError',
  'URIError',
  'AggregateError',
]);

export function checkErrors(rootDir) {
  const files = listFiles(join(rootDir, 'src'));
  const allowed = collectAppErrorSubclasses(files);
  const findings = [];

  for (const absolute of files) {
    const file = toRel(rootDir, absolute);
    const clean = stripComments(readSource(absolute));
    const isErrorDefinition = file.startsWith('src/platform/errors/');
    let match;

    // EH-1 — throw sites use the typed hierarchy.
    const throwNew = /\bthrow\s+new\s+([A-Za-z_$][\w$]*)\s*\(/g;
    while ((match = throwNew.exec(clean)) !== null) {
      const thrown = match[1];
      if (allowed.has(thrown)) continue;
      findings.push(
        finding({
          rule: 'EH-1',
          failureMode: 'F2',
          file,
          line: lineOf(clean, match.index),
          message: NATIVE_ERRORS.has(thrown)
            ? `Raw \`throw new ${thrown}(...)\` bypasses the AppError hierarchy: no code, no HTTP mapping, no operational flag.`
            : `\`throw new ${thrown}(...)\` does not throw a known AppError subclass.`,
          hint: 'Throw ValidationError (400), AuthenticationError (401), AuthorizationError (403), NotFoundError (404), ConflictError (409), BusinessRuleError (422) or InternalError (500) from src/platform/errors/.',
        }),
      );
    }

    // EH-2 — non-Error throws.
    const throwLiteral = /\bthrow\s+(['"`{[]|\d)/g;
    while ((match = throwLiteral.exec(clean)) !== null) {
      findings.push(
        finding({
          rule: 'EH-2',
          failureMode: 'F2',
          file,
          line: lineOf(clean, match.index),
          message: 'Throwing a non-Error value loses the stack, the code and the HTTP mapping.',
          hint: 'Throw an AppError subclass from src/platform/errors/.',
        }),
      );
    }

    // EH-3 — empty catch blocks.
    const emptyCatch = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
    while ((match = emptyCatch.exec(clean)) !== null) {
      findings.push(
        finding({
          rule: 'EH-3',
          failureMode: 'F2',
          file,
          line: lineOf(clean, match.index),
          message: 'Empty catch block silently swallows a failure.',
          hint: 'Log with the correlation id and rethrow, or convert it to an AppError that states what happened.',
        }),
      );
    }

    // EH-4 — hand-rolled error responses in route files.
    if (/\.routes\.ts$/.test(file)) {
      const manualStatus = /res\s*\.\s*status\s*\(\s*(4\d{2}|5\d{2})\s*\)/g;
      while ((match = manualStatus.exec(clean)) !== null) {
        findings.push(
          finding({
            rule: 'EH-4',
            failureMode: 'F2',
            file,
            line: lineOf(clean, match.index),
            message: `Route builds a ${match[1]} response by hand, bypassing the error middleware.`,
            hint: 'Throw the matching AppError; errorHandler() owns the status, the body shape and the log line.',
          }),
        );
      }
    }

    // EH-5 — BusinessRuleError needs a rule id first.
    const businessRule = /\bnew\s+BusinessRuleError\s*\(\s*([^,)]*)/g;
    while ((match = businessRule.exec(clean)) !== null) {
      const firstArg = (match[1] ?? '').trim();
      const looksLikeRuleId =
        /^['"`][A-Z][A-Z0-9]*-\d+['"`]$/.test(firstArg) || /rule/i.test(firstArg);
      if (!looksLikeRuleId && !isErrorDefinition) {
        findings.push(
          finding({
            rule: 'EH-5',
            failureMode: 'F2',
            file,
            line: lineOf(clean, match.index),
            message: `BusinessRuleError first argument is '${firstArg || '(empty)'}', not a rule id such as 'BR-3'.`,
            hint: 'Pass the rule id from the sprint contract, so the API response and the tests can branch on error.rule.',
          }),
        );
      }
    }

    // EH-6 — console logging (advisory).
    const consoleUse = /\bconsole\s*\.\s*(log|info|warn|error|debug)\s*\(/g;
    while ((match = consoleUse.exec(clean)) !== null) {
      findings.push(
        finding({
          severity: 'advisory',
          rule: 'EH-6',
          failureMode: 'F2',
          file,
          line: lineOf(clean, match.index),
          message: `console.${match[1]}() produces unstructured output with no correlation id.`,
          hint: 'Inject the Logger port from src/platform/support/logger.ts.',
        }),
      );
    }

    // EH-7 — catch blocks that return a blank value (advisory).
    const swallowingCatch = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*return\s+(null|undefined|\[\]|\{\})\s*;?\s*\}/g;
    while ((match = swallowingCatch.exec(clean)) !== null) {
      findings.push(
        finding({
          severity: 'advisory',
          rule: 'EH-7',
          failureMode: 'F2',
          file,
          line: lineOf(clean, match.index),
          message: `Catch block returns '${match[1]}', hiding the failure from the caller.`,
          hint: 'Log the failure and rethrow an AppError, or make the empty result an explicit, documented outcome.',
        }),
      );
    }
  }

  return {
    check: 'errors',
    description: 'typed AppError hierarchy and error-response ownership (failure mode F2)',
    scannedFileCount: files.length,
    findings,
  };
}

/** AppError plus the transitive closure of everything extending it. */
function collectAppErrorSubclasses(files) {
  const allowed = new Set(['AppError']);
  const declarations = [];

  for (const absolute of files) {
    const clean = stripComments(readSource(absolute));
    const pattern = /\bclass\s+(\w+)\s+extends\s+(\w+)/g;
    let match;
    while ((match = pattern.exec(clean)) !== null) {
      declarations.push({ child: match[1], parent: match[2] });
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const { child, parent } of declarations) {
      if (allowed.has(parent) && !allowed.has(child)) {
        allowed.add(child);
        changed = true;
      }
    }
  }

  return allowed;
}

if (isMain(import.meta.url)) {
  runAsCli(checkErrors);
}
