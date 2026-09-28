#!/usr/bin/env node
/**
 * GATE SELF-TEST — evidence that the harness prevents what it claims to.
 *
 * A governance gate that has never been observed to fail is
 * indistinguishable from a gate that does nothing. This script runs the
 * checks against the fixtures in `./fixtures/`, each of which contains a
 * deliberate instance of one of the four failure modes, and asserts that the
 * expected rule ids fire — plus that the clean control fixture produces no
 * blocking findings at all.
 *
 * Run with `npm run gate:selftest`. It is part of `npm run harness:verify`,
 * so a refactor of a check cannot silently disable it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBoundaries } from './check-boundaries.mjs';
import { checkErrors } from './check-errors.mjs';
import { checkEvents } from './check-events.mjs';
import { checkTestQuality } from './check-test-quality.mjs';
import { isMain } from './lib/scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');
const ALL_CHECKS = [checkBoundaries, checkErrors, checkTestQuality, checkEvents];

/**
 * Expectations are stated as rule ids that MUST fire. Extra findings are
 * allowed — a fixture that trips a related rule as well is a sign the rules
 * reinforce each other, not a failure.
 */
const EXPECTATIONS = [
  {
    fixture: 'f0-clean',
    failureMode: 'control',
    description: 'clean reference tree: typed errors, public contracts, write-then-publish, real assertions',
    mustFire: [],
    mustBeClean: true,
  },
  {
    fixture: 'f1-repository-import',
    failureMode: 'F1',
    description: "activities writes straight into the alerts module's repository",
    mustFire: ['MB-1', 'MB-6', 'EV-5'],
  },
  {
    fixture: 'f2-raw-error',
    failureMode: 'F2',
    description: 'raw Error / RangeError / string throws, empty catch, hand-rolled HTTP error responses',
    mustFire: ['EH-1', 'EH-2', 'EH-3', 'EH-4', 'EH-5'],
  },
  {
    fixture: 'f3-status-only-test',
    failureMode: 'F3',
    description: 'green tests that assert status codes and nothing about the business rules',
    mustFire: ['TQ-2', 'TQ-3', 'TQ-4', 'TQ-5'],
  },
  {
    fixture: 'f4-missing-event',
    failureMode: 'F4',
    description: 'declared event never published; wrong module publishes; subscriber misplaced and unnamed',
    mustFire: ['EV-1', 'EV-2', 'EV-3'],
  },
];

export function runSelfTest() {
  const cases = EXPECTATIONS.map((expectation) => {
    const rootDir = join(FIXTURES, expectation.fixture);
    const findings = ALL_CHECKS.flatMap((check) => {
      const result = check(rootDir);
      return result.findings.map((item) => ({ ...item, check: result.check }));
    });

    const blocking = findings.filter((item) => item.severity === 'blocking');
    const firedRules = [...new Set(blocking.map((item) => item.rule))].sort();
    const missing = expectation.mustFire.filter((rule) => !firedRules.includes(rule));

    const unexpectedlyDirty = Boolean(expectation.mustBeClean) && blocking.length > 0;
    const passed = missing.length === 0 && !unexpectedlyDirty;

    return {
      fixture: expectation.fixture,
      failureMode: expectation.failureMode,
      description: expectation.description,
      expectedRules: expectation.mustFire,
      firedRules,
      missingRules: missing,
      blockingCount: blocking.length,
      passed,
      ...(unexpectedlyDirty
        ? { unexpectedFindings: blocking.map((item) => `${item.rule} ${item.file}:${item.line}`) }
        : {}),
    };
  });

  const failed = cases.filter((item) => !item.passed);

  return {
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
    generatedAt: new Date().toISOString(),
    summary: {
      fixtures: cases.length,
      passed: cases.length - failed.length,
      failed: failed.length,
      failureModesCovered: [...new Set(cases.map((item) => item.failureMode))].filter(
        (mode) => mode !== 'control',
      ),
    },
    cases,
  };
}

function main() {
  const report = runSelfTest();
  const argv = process.argv.slice(2);

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write('\n=== Harness gate self-test ===\n\n');
    for (const item of report.cases) {
      process.stdout.write(
        `[${item.passed ? 'PASS' : 'FAIL'}] ${item.fixture}  (${item.failureMode})\n`,
      );
      process.stdout.write(`        ${item.description}\n`);
      if (item.expectedRules.length > 0) {
        process.stdout.write(`        expected: ${item.expectedRules.join(', ')}\n`);
      }
      process.stdout.write(
        `        fired:    ${item.firedRules.length > 0 ? item.firedRules.join(', ') : '(none)'}\n`,
      );
      if (item.missingRules.length > 0) {
        process.stdout.write(`        MISSING:  ${item.missingRules.join(', ')}\n`);
      }
      if (item.unexpectedFindings) {
        for (const line of item.unexpectedFindings) {
          process.stdout.write(`        UNEXPECTED: ${line}\n`);
        }
      }
      process.stdout.write('\n');
    }
    process.stdout.write(
      `SELF-TEST VERDICT: ${report.verdict}  (${report.summary.passed}/${report.summary.fixtures} fixtures, failure modes covered: ${report.summary.failureModesCovered.join(', ')})\n\n`,
    );
  }

  const outPath = resolve(process.cwd(), '.harness/output/gate-selftest.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  process.exitCode = report.verdict === 'PASS' ? 0 : 1;
}

if (isMain(import.meta.url)) {
  main();
}
