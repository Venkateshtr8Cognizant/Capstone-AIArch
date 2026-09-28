#!/usr/bin/env node
/**
 * THE GATE — the deterministic half of the Evaluator.
 *
 * One command, one verdict. The Evaluator agent runs this FIRST and is
 * instructed never to overrule it: a blocking finding is a FAIL, full stop.
 * The agent's judgement is then spent on what a script cannot see — whether
 * the acceptance criteria are genuinely met, whether the tests are
 * meaningful, whether the design will survive the next change.
 *
 * That split is the whole point of the design: the non-deterministic
 * reviewer cannot weaken a deterministic rule, and the deterministic rules
 * cannot judge intent.
 *
 * Usage
 *   node .harness/checks/gate.mjs                 static checks only (~0.2s)
 *   node .harness/checks/gate.mjs --with-build    also typecheck + tests + coverage
 *   node .harness/checks/gate.mjs --json          machine-readable output
 *   node .harness/checks/gate.mjs --root=<dir>    check another tree
 *   node .harness/checks/gate.mjs --out=<file>    where to write the report
 *   node .harness/checks/gate.mjs --quiet         report file only, no stdout
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { checkBoundaries } from './check-boundaries.mjs';
import { checkErrors } from './check-errors.mjs';
import { checkEvents } from './check-events.mjs';
import { checkTestQuality } from './check-test-quality.mjs';
import { isMain, printResult } from './lib/scan.mjs';

const CHECKS = [checkBoundaries, checkErrors, checkTestQuality, checkEvents];

/** The four failure modes the client's standards team demanded we prevent. */
export const FAILURE_MODES = {
  F1: "Direct imports from another module's repository, bypassing the service boundary and event bus",
  F2: 'Raw Error throws in service methods, bypassing the typed AppError hierarchy',
  F3: 'Tests that assert HTTP status codes without verifying business rule compliance',
  F4: 'Missing event bus integration — state changes written directly to sibling module repositories',
};

export function runGate(rootDir, { withBuild = false } = {}) {
  const results = CHECKS.map((check) => check(rootDir));
  const findings = results.flatMap((result) =>
    result.findings.map((item) => ({ ...item, check: result.check })),
  );

  const buildSteps = withBuild ? runBuildSteps(rootDir) : [];

  const blocking = findings.filter((item) => item.severity === 'blocking');
  const advisory = findings.filter((item) => item.severity === 'advisory');
  const failedSteps = buildSteps.filter((step) => !step.passed);
  const verdict = blocking.length > 0 || failedSteps.length > 0 ? 'FAIL' : 'PASS';

  const byFailureMode = Object.fromEntries(
    Object.entries(FAILURE_MODES).map(([mode, description]) => [
      mode,
      {
        description,
        blocking: blocking.filter((item) => item.failureMode === mode).length,
        advisory: advisory.filter((item) => item.failureMode === mode).length,
      },
    ]),
  );

  return {
    verdict,
    generatedAt: new Date().toISOString(),
    rootDir,
    summary: {
      checksRun: results.length,
      blockingCount: blocking.length,
      advisoryCount: advisory.length,
      buildStepsRun: buildSteps.length,
      buildStepsFailed: failedSteps.length,
    },
    byFailureMode,
    checks: results.map((result) => ({
      check: result.check,
      description: result.description,
      scannedFileCount: result.scannedFileCount,
      blocking: result.findings.filter((item) => item.severity === 'blocking').length,
      advisory: result.findings.filter((item) => item.severity === 'advisory').length,
    })),
    findings,
    buildSteps,
    eventInventory: results.find((result) => result.check === 'events')?.inventory ?? null,
    results,
  };
}

/**
 * The non-negotiable build steps. Coverage runs with the thresholds from
 * SPEC 3.6 configured in vitest.config.ts, so a coverage regression is a
 * gate failure rather than a number nobody reads.
 */
function runBuildSteps(rootDir) {
  const steps = [
    { name: 'typecheck', command: 'npx', args: ['tsc', '-p', 'tsconfig.json', '--noEmit'] },
    { name: 'tests+coverage', command: 'npx', args: ['vitest', 'run', '--coverage'] },
  ];

  return steps.map((step) => {
    const started = Date.now();
    const outcome = spawnSync(step.command, step.args, {
      cwd: rootDir,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    const output = `${outcome.stdout ?? ''}${outcome.stderr ?? ''}`;
    return {
      name: step.name,
      passed: outcome.status === 0,
      exitCode: outcome.status,
      durationMs: Date.now() - started,
      tail: output.trim().split('\n').slice(-16).join('\n'),
    };
  });
}

function main() {
  const argv = process.argv.slice(2);
  const rootArg = argv.find((arg) => arg.startsWith('--root='));
  const outArg = argv.find((arg) => arg.startsWith('--out='));
  const rootDir = resolve(rootArg ? rootArg.slice('--root='.length) : process.cwd());
  const report = runGate(rootDir, { withBuild: argv.includes('--with-build') });

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (!argv.includes('--quiet')) {
    process.stdout.write('\n=== StoreOps harness gate ===\n');
    for (const result of report.results) {
      printResult(result);
    }
    for (const step of report.buildSteps) {
      process.stdout.write(
        `\n[${step.passed ? 'PASS' : 'FAIL'}] ${step.name} (${step.durationMs} ms, exit ${step.exitCode})\n`,
      );
      if (!step.passed) {
        process.stdout.write(`${step.tail.replace(/^/gm, '        ')}\n`);
      }
    }
    process.stdout.write('\n--- failure mode coverage ---\n');
    for (const [mode, data] of Object.entries(report.byFailureMode)) {
      process.stdout.write(`  ${mode}  blocking:${data.blocking}  advisory:${data.advisory}  ${data.description}\n`);
    }
    process.stdout.write(
      `\nGATE VERDICT: ${report.verdict}  (blocking ${report.summary.blockingCount}, advisory ${report.summary.advisoryCount})\n\n`,
    );
  }

  const outPath = resolve(
    rootDir,
    outArg ? outArg.slice('--out='.length) : '.harness/output/gate-report.json',
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  process.exitCode = report.verdict === 'PASS' ? 0 : 1;
}

if (isMain(import.meta.url)) {
  main();
}
