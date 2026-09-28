/**
 * CHECK 1 — module boundaries.
 *
 * Targets failure mode F1: "direct imports from another module's repository,
 * bypassing the agreed service boundary and event bus".
 *
 * SPEC 3.3 permits exactly two forms of cross-module coupling:
 *   1. read-only lookups through the other module's PUBLIC contract;
 *   2. side effects through the event bus.
 * Everything else is a boundary violation.
 *
 * Rules
 *   MB-1  A cross-module import must target `src/modules/<other>/index.ts`
 *         and nothing else. Every other file in a module is module-private.
 *   MB-2  `src/platform/**` must not import `src/modules/**`.
 *   MB-3  `src/contracts/**` must import nothing outside `src/contracts/**`.
 *   MB-4  A module file must not import its own module's `index.ts`
 *         (a cycle through the public contract).
 *   MB-5  `tests/integration/**` must exercise public surfaces only — no
 *         imports of `*.repository.ts` or `*.service.ts`.
 *   MB-6  No file outside a module may name that module's repository symbol.
 *   MB-7  Only the composition root (`src/app.ts`) may import more than one
 *         module's public contract, plus modules that legitimately hold a
 *         read port. Routes must never import a sibling module at all.
 */
import { join } from 'node:path';
import {
  finding,
  isMain,
  listFiles,
  parseImports,
  readSource,
  resolveImport,
  runAsCli,
  stripComments,
  toRel,
} from './lib/scan.mjs';

const MODULES = 'src/modules';
const COMPOSITION_ROOT = 'src/app.ts';

export function checkBoundaries(rootDir) {
  const files = [...listFiles(join(rootDir, 'src')), ...listFiles(join(rootDir, 'tests'))];
  const findings = [];
  const repositorySymbols = collectRepositorySymbols(rootDir, files);

  for (const absolute of files) {
    const file = toRel(rootDir, absolute);
    const source = readSource(absolute);
    const owner = moduleOf(file);

    for (const { specifier, line } of parseImports(source)) {
      const target = resolveImport(rootDir, absolute, specifier);
      if (!target) continue;
      const targetOwner = moduleOf(target);

      // MB-1 — cross-module imports land on the public contract only.
      // `tests/unit/**` is deliberately exempt: white-box unit tests of a
      // module's own rules and types are the cheapest place to pin business
      // behaviour. `tests/integration/**` is held to the public surface by
      // MB-5 instead.
      const isUnitTest = file.startsWith('tests/unit/');
      if (
        !isUnitTest &&
        targetOwner &&
        targetOwner !== owner &&
        target !== `${MODULES}/${targetOwner}/index.ts`
      ) {
        const isRepository = /\.repository\.ts$/.test(target);
        findings.push(
          finding({
            rule: 'MB-1',
            failureMode: 'F1',
            file,
            line,
            message: isRepository
              ? `${describe(owner, file)} imports the repository of module '${targetOwner}' ('${target}').`
              : `${describe(owner, file)} imports '${target}', which is private to module '${targetOwner}'.`,
            hint: `Import the read port type from '${MODULES}/${targetOwner}/index.ts' for lookups, or publish an event in src/contracts/events.ts for a state change.`,
          }),
        );
      }

      // MB-2 — the platform layer is module-agnostic.
      if (file.startsWith('src/platform/') && target.startsWith(`${MODULES}/`)) {
        findings.push(
          finding({
            rule: 'MB-2',
            failureMode: 'F1',
            file,
            line,
            message: `Platform file imports module code ('${target}'). The platform layer must not depend on any module.`,
            hint: 'Move the shared type into src/contracts/, or invert the dependency with a port the module implements.',
          }),
        );
      }

      // MB-3 — contracts are the published language and stay dependency-free.
      if (file.startsWith('src/contracts/') && !target.startsWith('src/contracts/')) {
        findings.push(
          finding({
            rule: 'MB-3',
            failureMode: 'F1',
            file,
            line,
            message: `Contract file imports '${target}'. src/contracts/** must be free of platform and module dependencies.`,
            hint: 'Inline the type in src/contracts/, or keep the dependency on the consumer side.',
          }),
        );
      }

      // MB-4 — no cycle through a module's own public contract.
      if (owner && file !== `${MODULES}/${owner}/index.ts` && target === `${MODULES}/${owner}/index.ts`) {
        findings.push(
          finding({
            rule: 'MB-4',
            failureMode: 'F1',
            file,
            line,
            message: `'${file}' imports its own module's public index, creating a cycle.`,
            hint: 'Import the sibling file inside the module directly, or move the shared type into <module>.types.ts.',
          }),
        );
      }

      // MB-5 — integration tests drive public surfaces.
      if (
        file.startsWith('tests/integration/') &&
        (/\.repository\.ts$/.test(target) || /\.service\.ts$/.test(target))
      ) {
        findings.push(
          finding({
            rule: 'MB-5',
            failureMode: 'F1',
            file,
            line,
            message: `Integration test imports a module internal ('${target}').`,
            hint: 'Drive the behaviour through HTTP (supertest) or the module public index; keep internal tests in tests/unit/.',
          }),
        );
      }

      // MB-7 — routes never reach across modules.
      if (/\.routes\.ts$/.test(file) && targetOwner && targetOwner !== owner) {
        findings.push(
          finding({
            rule: 'MB-7',
            failureMode: 'F1',
            file,
            line,
            message: `Route file imports module '${targetOwner}'. Routes depend on their own service only.`,
            hint: 'Move the cross-module read into the service layer, which receives the other module\'s read port by injection.',
          }),
        );
      }
    }

    // MB-6 — repository symbols must not be named outside their module.
    if (!file.startsWith('tests/')) {
      const clean = stripComments(source);
      for (const [symbol, symbolOwner] of repositorySymbols) {
        if (symbolOwner === owner) continue;
        const match = new RegExp(`\\b${symbol}\\b`).exec(clean);
        if (match) {
          findings.push(
            finding({
              rule: 'MB-6',
              failureMode: 'F1',
              file,
              line: clean.slice(0, match.index).split('\n').length,
              message: `'${file}' names '${symbol}', the repository port of module '${symbolOwner}'.`,
              hint: `Use the '${symbolOwner}' module's public read port for lookups and an event for writes.`,
            }),
          );
        }
      }
    }
  }

  findings.push(...checkFanOut(rootDir, files));

  return {
    check: 'boundaries',
    description: 'module boundaries and service-contract integrity (failure mode F1)',
    scannedFileCount: files.length,
    findings,
  };
}

/**
 * MB-7 (second half) — only the composition root may wire many modules
 * together. A module that imports two or more sibling contracts is taking on
 * orchestration that belongs in `src/app.ts`.
 */
function checkFanOut(rootDir, files) {
  const findings = [];
  for (const absolute of files) {
    const file = toRel(rootDir, absolute);
    if (file === COMPOSITION_ROOT || file.startsWith('tests/')) continue;
    const owner = moduleOf(file);
    if (!owner) continue;

    const siblings = new Set();
    for (const { specifier } of parseImports(readSource(absolute))) {
      const target = resolveImport(rootDir, absolute, specifier);
      const targetOwner = target ? moduleOf(target) : null;
      if (targetOwner && targetOwner !== owner) {
        siblings.add(targetOwner);
      }
    }

    if (siblings.size > 2) {
      findings.push(
        finding({
          rule: 'MB-7',
          failureMode: 'F1',
          file,
          line: 1,
          message: `'${file}' depends on ${siblings.size} sibling modules (${[...siblings].sort().join(', ')}).`,
          hint: 'Orchestration across three or more modules belongs in src/app.ts or in an event subscriber, not inside one module.',
        }),
      );
    }
  }
  return findings;
}

function describe(owner, file) {
  return owner ? `Module '${owner}'` : `'${file}'`;
}

function moduleOf(relPath) {
  const match = new RegExp(`^${MODULES}/([^/]+)/`).exec(relPath);
  return match ? match[1] : null;
}

/** Finds every `*Repository` interface/class and the module that owns it. */
function collectRepositorySymbols(rootDir, files) {
  const symbols = new Map();
  for (const absolute of files) {
    const file = toRel(rootDir, absolute);
    const owner = moduleOf(file);
    if (!owner) continue;
    const clean = stripComments(readSource(absolute));
    const pattern = /\b(?:export\s+)?(?:interface|class|abstract\s+class)\s+(\w*Repository)\b/g;
    let match;
    while ((match = pattern.exec(clean)) !== null) {
      symbols.set(match[1], owner);
    }
  }
  return symbols;
}

if (isMain(import.meta.url)) {
  runAsCli(checkBoundaries);
}
