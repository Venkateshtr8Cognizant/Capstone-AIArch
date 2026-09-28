/**
 * CHECK 3 — test quality.
 *
 * Targets failure mode F3: "tests that asserted HTTP status codes but did
 * not verify business rule compliance".
 *
 * This is the check that most needs care. A test suite can be 100% green and
 * still prove nothing, and coverage percentages do not detect it: a test that
 * calls an endpoint and asserts `200` executes every line of the handler.
 * So the check reads each test case and asks what it actually asserted.
 *
 * Rules
 *   TQ-1  Every test case must assert something.
 *   TQ-2  A test that asserts a status code must also assert a business
 *         outcome: a response body field, an emitted event, a typed error
 *         code, or persisted state.
 *   TQ-3  A test that asserts a 422 must assert which rule was violated
 *         (`error.rule` or `details[].rule`). A 422 with no rule id does not
 *         prove which business rule fired.
 *   TQ-4  A test file must contain at least one rejection case — a suite of
 *         happy paths cannot show that a rule is enforced.
 *   TQ-5  No disabled or exclusive tests (`.skip`, `.todo`, `.only`).
 *   TQ-6  No wall-clock or random-id dependence (advisory): the project
 *         injects Clock and IdGenerator precisely so tests are deterministic.
 *   TQ-7  Every business rule id declared in the active sprint contract must
 *         appear in at least one test assertion.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractCallBlocks,
  finding,
  isMain,
  listFiles,
  readSource,
  runAsCli,
  stripComments,
  toRel,
} from './lib/scan.mjs';

const STATUS_PATTERNS = [
  /\.expect\(\s*\d{3}\s*\)/,
  /\bstatus\s*\)?\s*\.\s*(?:toBe|toEqual|toStrictEqual)\(\s*\d{3}/,
  /statusCode\s*\)?\s*\.\s*(?:toBe|toEqual)\(\s*\d{3}/,
];

/** Tokens showing a test looked at the business outcome, not the envelope. */
const BUSINESS_TOKENS = [
  'body.data',
  'body.error',
  '.payload',
  'events(',
  '.rule',
  'error.code',
  '.details',
  'toBeInstanceOf',
  'rejects',
  '.updated',
  '.failed',
  'updatedCount',
  'failedCount',
  'auditEntryCount',
  'metrics',
  'listForUser',
  'findLatest',
  'subscribersOf',
  'toMatchObject',
  'logger.',
  '.status).toBe(\'',
  'code:',
];

export function checkTestQuality(rootDir) {
  const files = listFiles(join(rootDir, 'tests'), { extensions: ['.test.ts'] });
  const findings = [];
  const allTestSource = files.map((absolute) => readSource(absolute)).join('\n');

  for (const absolute of files) {
    const file = toRel(rootDir, absolute);
    const source = readSource(absolute);
    const clean = stripComments(source);
    const cases = extractCallBlocks(source, ['it', 'test']);
    let match;

    // TQ-5 — disabled or exclusive tests.
    const skipped = /\b(?:it|test|describe)\s*\.\s*(skip|todo|only)\s*\(/g;
    while ((match = skipped.exec(clean)) !== null) {
      findings.push(
        finding({
          rule: 'TQ-5',
          failureMode: 'F3',
          file,
          line: clean.slice(0, match.index).split('\n').length,
          message: `Test marked '.${match[1]}' — a disabled or exclusive test hides coverage from the gate.`,
          hint: 'Delete it, or fix it and re-enable it within this sprint.',
        }),
      );
    }

    let rejectionCases = 0;

    for (const testCase of cases) {
      const body = testCase.body;
      const hasAnyAssertion = /\bexpect\s*\(|\.expect\s*\(|\bassert\b/.test(body);
      /**
       * TQ-2 and TQ-3 are about API tests: failure mode F3 is specifically
       * "tests that assert HTTP status codes". A unit test asserting
       * `error.statusCode === 422` on a typed error is asserting a property
       * of the error contract, which is a business assertion, so the status
       * heuristic only applies where the case actually issues a request.
       */
      const isHttpCase = /\brequest\s*\(|\.expect\s*\(/.test(body);
      const statusAssertion = isHttpCase && STATUS_PATTERNS.some((pattern) => pattern.test(body));
      const businessAssertion = BUSINESS_TOKENS.some((token) => body.includes(token));

      // TQ-1 — a test with no assertion proves nothing.
      if (!hasAnyAssertion) {
        findings.push(
          finding({
            rule: 'TQ-1',
            failureMode: 'F3',
            file,
            line: testCase.line,
            message: `Test "${testCase.title}" makes no assertion.`,
            hint: 'Assert the business outcome stated in the acceptance criterion.',
          }),
        );
        continue;
      }

      // TQ-2 — a status code alone is not a business assertion.
      if (statusAssertion && !businessAssertion) {
        findings.push(
          finding({
            rule: 'TQ-2',
            failureMode: 'F3',
            file,
            line: testCase.line,
            message: `Test "${testCase.title}" asserts an HTTP status code but no business outcome.`,
            hint: 'Add an assertion on the response body, the emitted domain event, the typed error code, or the persisted state.',
          }),
        );
      }

      // TQ-3 — a 422 response must name the rule it enforced.
      if (isHttpCase && /\b422\b/.test(body) && !/\.rule\b|rule:/.test(body)) {
        findings.push(
          finding({
            rule: 'TQ-3',
            failureMode: 'F3',
            file,
            line: testCase.line,
            message: `Test "${testCase.title}" asserts a 422 without asserting which business rule was violated.`,
            hint: 'Assert response.body.error.rule (or details[].rule) against the rule id in the sprint contract.',
          }),
        );
      }

      if (/\b(4\d{2}|5\d{2})\b|rejects|toThrow|NOT_PERMITTED|_NOT_FOUND|FORBIDDEN/.test(body)) {
        rejectionCases += 1;
      }
    }

    // TQ-4 — happy path only.
    if (cases.length > 0 && rejectionCases === 0) {
      findings.push(
        finding({
          rule: 'TQ-4',
          failureMode: 'F3',
          file,
          line: 1,
          message: `'${file}' contains ${cases.length} test case(s) and no rejection case.`,
          hint: 'Add at least one case proving the feature refuses invalid input, per the rejection criteria in the sprint contract.',
        }),
      );
    }

    // TQ-6 — non-deterministic assertions (advisory).
    const nondeterminism = /\b(?:new Date\(\)|Date\.now\(\)|Math\.random\(\)|randomUUID\(\))/g;
    while ((match = nondeterminism.exec(clean)) !== null) {
      findings.push(
        finding({
          severity: 'advisory',
          rule: 'TQ-6',
          failureMode: 'F3',
          file,
          line: clean.slice(0, match.index).split('\n').length,
          message: `Test uses '${match[0]}', making the assertion time- or id-dependent.`,
          hint: 'Use FixedClock and SequentialIdGenerator via buildFixture().',
        }),
      );
    }
  }

  findings.push(...checkContractRuleCoverage(rootDir, allTestSource));

  return {
    check: 'test-quality',
    description: 'business-rule assertions rather than status-code-only tests (failure mode F3)',
    scannedFileCount: files.length,
    findings,
  };
}

/**
 * TQ-7 — every rule id in the active sprint contract must be asserted
 * somewhere. This is what ties the tests back to the Planner's acceptance
 * criteria: the Generator cannot satisfy the gate by writing tests for
 * whatever happens to be easy.
 */
function checkContractRuleCoverage(rootDir, allTestSource) {
  const findings = [];
  const contractPath = join(rootDir, '.harness/output/active-rules.json');
  if (!existsSync(contractPath)) {
    return findings;
  }

  let declared;
  try {
    declared = JSON.parse(readFileSync(contractPath, 'utf8'));
  } catch {
    findings.push(
      finding({
        rule: 'TQ-7',
        failureMode: 'F3',
        file: '.harness/output/active-rules.json',
        line: 1,
        message: 'active-rules.json is not valid JSON, so contract rule coverage cannot be verified.',
        hint: 'The Planner writes this file; regenerate it from the sprint contract.',
      }),
    );
    return findings;
  }

  const rules = Array.isArray(declared?.rules) ? declared.rules : [];
  for (const rule of rules) {
    const id = typeof rule === 'string' ? rule : rule?.id;
    if (!id) continue;
    /**
     * The rule id must appear in the test sources — as an assertion on
     * `error.rule` for rules that reject a request, or in the test name for
     * post-condition rules (BR-10, BR-11) which have no error to assert on.
     *
     * Known limitation, accepted deliberately: a rule id in a comment
     * satisfies this check. Closing that gap syntactically would mean
     * reimplementing a test runner. It is instead the Evaluator's Step 3 —
     * confirm the named test actually provokes the rule. This is a worked
     * example of the split this harness is built on: the script proves the
     * link exists, the reviewing agent proves the link is real.
     */
    const asserted = new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(
      allTestSource,
    );
    if (!asserted) {
      findings.push(
        finding({
          rule: 'TQ-7',
          failureMode: 'F3',
          file: '.harness/output/active-rules.json',
          line: 1,
          message: `Business rule '${id}' from the active sprint contract is not asserted by any test.`,
          hint: `Add a test that provokes ${id} and asserts on the rule id, or remove it from the contract if it is out of scope.`,
        }),
      );
    }
  }

  return findings;
}

if (isMain(import.meta.url)) {
  runAsCli(checkTestQuality);
}
