/**
 * Shared scanning helpers for the harness checks.
 *
 * The checks are deliberately dependency-free and syntactic rather than
 * type-aware: they must run in well under a second on every Generator
 * iteration, on any developer machine and in CI, with no build step and no
 * npm install. Anything that genuinely needs the type system is left to
 * `tsc` and to the test suite, which the gate also runs (`--with-build`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_IGNORE = new Set(['node_modules', 'dist', '.git', 'coverage', '.harness']);

/** Recursively lists files under `dir` with one of `extensions`. */
export function listFiles(dir, { extensions = ['.ts'], ignore = DEFAULT_IGNORE } = {}) {
  const out = [];
  walk(dir, out, extensions, ignore);
  return out.sort();
}

function walk(current, out, extensions, ignore) {
  let entries;
  try {
    entries = readdirSync(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (ignore.has(entry.name)) continue;
    const full = join(current, entry.name);
    if (entry.isDirectory()) {
      walk(full, out, extensions, ignore);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
}

/** Repo-relative POSIX path, so findings read the same on every platform. */
export function toRel(rootDir, filePath) {
  return relative(rootDir, filePath).split(sep).join(posix.sep);
}

export function readSource(filePath) {
  return readFileSync(filePath, 'utf8');
}

/**
 * Blanks out comments so pattern matches cannot hit prose, while preserving
 * offsets (and therefore line numbers) and string literals — import paths
 * and event names must stay matchable.
 */
export function stripComments(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  let state = 'code';
  let quote = '';

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'line-comment';
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'block-comment';
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        state = 'string';
        quote = ch;
        out += ch;
        i += 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    if (state === 'line-comment') {
      if (ch === '\n') {
        state = 'code';
        out += '\n';
      } else {
        out += ' ';
      }
      i += 1;
      continue;
    }

    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        state = 'code';
        out += '  ';
        i += 2;
        continue;
      }
      out += ch === '\n' ? '\n' : ' ';
      i += 1;
      continue;
    }

    // state === 'string'
    out += ch;
    if (ch === '\\') {
      out += source[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (ch === quote) {
      state = 'code';
    }
    i += 1;
  }

  return out;
}

/** 1-indexed line number of a character offset. */
export function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

const IMPORT_PATTERNS = [
  /\bimport\s+type\s+[^;'"]*?from\s*['"]([^'"]+)['"]/g,
  /\bimport\s+[^;'"]*?from\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bexport\s+(?:type\s+)?[^;'"]*?from\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** Every import specifier in a file, with its line number. */
export function parseImports(source) {
  const clean = stripComments(source);
  const seen = new Map();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(clean)) !== null) {
      const specifier = match[1];
      const line = lineOf(clean, match.index);
      const key = `${specifier}@${line}`;
      if (!seen.has(key)) {
        seen.set(key, { specifier, line });
      }
    }
  }
  return [...seen.values()];
}

/**
 * Resolves a relative import specifier to a repo-relative module path,
 * normalising the `.js` extension TypeScript ESM requires back to `.ts`.
 */
export function resolveImport(rootDir, fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const absolute = resolve(resolve(fromFile, '..'), specifier);
  return toRel(rootDir, absolute).replace(/\.js$/, '.ts');
}

/**
 * Extracts `name(...)` call blocks with balanced parentheses, so one test
 * case or one function body can be reasoned about at a time.
 */
export function extractCallBlocks(source, names) {
  const clean = stripComments(source);
  const blocks = [];
  // The trailing `\b` matters: without it, `it` matches inside `items`.
  // The optional group handles table-driven cases (`it.each([...])(...)`).
  const namePattern = new RegExp(
    `\\b(${names.join('|')})\\b\\s*(?:\\.\\s*each\\s*\\(([\\s\\S]*?)\\)\\s*)?\\(`,
    'g',
  );
  let match;

  while ((match = namePattern.exec(clean)) !== null) {
    const openParen = match.index + match[0].length - 1;
    const end = matchDelimiter(clean, openParen);
    if (end === -1) continue;
    const body = clean.slice(openParen + 1, end);
    const titleMatch = /^\s*(['"`])([\s\S]*?)\1/.exec(body);
    blocks.push({
      name: match[1],
      title: titleMatch ? titleMatch[2].replace(/\s+/g, ' ').trim() : '(untitled)',
      body,
      line: lineOf(clean, match.index),
    });
    namePattern.lastIndex = end;
  }

  return blocks;
}

function matchDelimiter(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Builds a finding in the shape the gate report expects. */
export function finding({ severity = 'blocking', rule, file, line, message, hint, failureMode }) {
  return { severity, rule, file, line, message, hint, failureMode };
}

/** True when this module is the entry point (space-safe on Windows). */
export function isMain(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  return moduleUrl === pathToFileURL(entry).href;
}

/** CLI wrapper shared by every check. */
export function runAsCli(check, argv = process.argv.slice(2)) {
  const rootArg = argv.find((arg) => arg.startsWith('--root='));
  const rootDir = resolve(rootArg ? rootArg.slice('--root='.length) : process.cwd());
  const result = check(rootDir);

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printResult(result);
  }
  process.exitCode = result.findings.some((item) => item.severity === 'blocking') ? 1 : 0;
  return result;
}

export function printResult(result) {
  const blocking = result.findings.filter((item) => item.severity === 'blocking');
  const advisory = result.findings.filter((item) => item.severity === 'advisory');
  const status = blocking.length === 0 ? 'PASS' : 'FAIL';
  process.stdout.write(`\n[${status}] ${result.check} - ${result.description}\n`);
  process.stdout.write(`  scanned ${result.scannedFileCount} file(s)\n`);
  for (const item of [...blocking, ...advisory]) {
    const tag = item.severity === 'blocking' ? 'BLOCK' : 'ADVIS';
    process.stdout.write(`  ${tag} ${item.rule} [${item.failureMode}] ${item.file}:${item.line}\n`);
    process.stdout.write(`        ${item.message}\n`);
    if (item.hint) process.stdout.write(`        fix: ${item.hint}\n`);
  }
  if (result.findings.length === 0) {
    process.stdout.write('  no violations\n');
  }
}
