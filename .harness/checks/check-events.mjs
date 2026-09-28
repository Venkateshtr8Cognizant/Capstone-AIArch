/**
 * CHECK 4 — event bus integration.
 *
 * Targets failure mode F4: "missing event bus integration — state changes
 * written directly to sibling module repositories".
 *
 * F1 catches the illegal import. F4 catches the subtler failure: the code
 * compiles, the boundaries look clean, but the cross-module side effect was
 * simply never wired, so the sibling module silently never reacts.
 *
 * Rules
 *   EV-1  Every event type declared in `StoreOpsEventMap`/`EVENT_OWNERS`
 *         must have at least one publisher.
 *   EV-2  An event may only be published by the module that owns it.
 *   EV-3  Subscribers live in `<module>.subscribers.ts` and their subscriber
 *         name must be prefixed with the subscribing module, so dead-letter
 *         logs name the owner.
 *   EV-4  Route files must not publish events; a state change and its event
 *         belong together in the service layer.
 *   EV-5  A module must not import a sibling's service or subscriber
 *         implementation — read ports are types, side effects are events.
 *   EV-6  A published event with no in-process subscriber is reported as
 *         advisory: legitimate when the consumer is downstream, a dead
 *         channel otherwise. The Monitor tracks it.
 *   EV-7  A service that writes state must publish its event AFTER the write
 *         (advisory): publishing first can alert on work that never landed.
 */
import { join } from 'node:path';
import {
  finding,
  isMain,
  lineOf,
  listFiles,
  parseImports,
  readSource,
  resolveImport,
  runAsCli,
  stripComments,
  toRel,
} from './lib/scan.mjs';

const CONTRACTS = 'src/contracts/events.ts';

export function checkEvents(rootDir) {
  const files = listFiles(join(rootDir, 'src'));
  const findings = [];
  const owners = parseEventOwners(rootDir, files);

  if (owners.size === 0) {
    return {
      check: 'events',
      description: 'event-driven cross-module state changes (failure mode F4)',
      scannedFileCount: files.length,
      findings: [
        finding({
          rule: 'EV-0',
          failureMode: 'F4',
          file: CONTRACTS,
          line: 1,
          message: 'No EVENT_OWNERS map found. The event catalogue is the contract this check enforces.',
          hint: 'Declare StoreOpsEventMap and EVENT_OWNERS in src/contracts/events.ts.',
        }),
      ],
    };
  }

  const published = new Map();
  const subscribed = new Map();

  for (const absolute of files) {
    const file = toRel(rootDir, absolute);
    if (file === CONTRACTS) continue;
    const source = readSource(absolute);
    const clean = stripComments(source);
    const owner = moduleOf(file);

    for (const [eventType, expectedOwner] of owners) {
      const literal = new RegExp(`(['"\`])${escapeRegExp(eventType)}\\1`, 'g');
      let match;
      while ((match = literal.exec(clean)) !== null) {
        const before = clean.slice(0, match.index).trimEnd();
        const line = lineOf(clean, match.index);
        const isSubscription = /\.subscribe\s*\($/.test(before);
        const isPublication = /\btype\s*:$/.test(before);

        if (isSubscription) {
          record(subscribed, eventType, { file, line, owner });
          findings.push(...checkSubscriber({ clean, matchIndex: match.index, file, line, owner, eventType }));
          continue;
        }

        if (isPublication) {
          record(published, eventType, { file, line, owner });

          // EV-2 — only the owning module publishes.
          if (owner && owner !== expectedOwner) {
            findings.push(
              finding({
                rule: 'EV-2',
                failureMode: 'F4',
                file,
                line,
                message: `Module '${owner}' publishes '${eventType}', which is owned by '${expectedOwner}'.`,
                hint: `Publish an event owned by '${owner}' and let '${expectedOwner}' react to it in its own subscriber.`,
              }),
            );
          }

          // EV-4 — routes do not publish.
          if (/\.routes\.ts$/.test(file)) {
            findings.push(
              finding({
                rule: 'EV-4',
                failureMode: 'F4',
                file,
                line,
                message: `Route file publishes '${eventType}'. Events belong with the state change, in the service layer.`,
                hint: 'Move the publish into the service method that performs the write.',
              }),
            );
          }
        }
      }
    }

    // EV-5 — no direct import of a sibling's implementation.
    for (const { specifier, line } of parseImports(source)) {
      const target = resolveImport(rootDir, absolute, specifier);
      if (!target || !owner) continue;
      const targetOwner = moduleOf(target);
      if (targetOwner && targetOwner !== owner && /\.(service|subscribers|repository)\.ts$/.test(target)) {
        findings.push(
          finding({
            rule: 'EV-5',
            failureMode: 'F4',
            file,
            line,
            message: `Module '${owner}' imports the implementation of '${targetOwner}' ('${target}') directly.`,
            hint: `Depend on the '${targetOwner}' read port TYPE from its index.ts for lookups; use an event for side effects.`,
          }),
        );
      }
    }

    // EV-7 — publish before write (advisory).
    if (/\.service\.ts$/.test(file)) {
      findings.push(...checkPublishAfterWrite(clean, file));
    }
  }

  // EV-1 — declared events must be published somewhere.
  for (const [eventType, expectedOwner] of owners) {
    if (!published.has(eventType)) {
      findings.push(
        finding({
          rule: 'EV-1',
          failureMode: 'F4',
          file: CONTRACTS,
          line: 1,
          message: `Event '${eventType}' is declared but never published by module '${expectedOwner}'.`,
          hint: `Publish it from the ${expectedOwner} service method that performs the state change, or remove it from the catalogue.`,
        }),
      );
    }
  }

  // EV-6 — published with no listener (advisory).
  for (const [eventType] of owners) {
    if (published.has(eventType) && !subscribed.has(eventType)) {
      findings.push(
        finding({
          severity: 'advisory',
          rule: 'EV-6',
          failureMode: 'F4',
          file: CONTRACTS,
          line: 1,
          message: `Event '${eventType}' has no in-process subscriber.`,
          hint: 'Expected when the consumer is downstream (analytics, export). Raise it with the Monitor if a sibling module was supposed to react.',
        }),
      );
    }
  }

  return {
    check: 'events',
    description: 'event-driven cross-module state changes (failure mode F4)',
    scannedFileCount: files.length,
    findings,
    inventory: {
      publishers: Object.fromEntries(
        [...published].map(([key, value]) => [key, value.map((entry) => `${entry.file}:${entry.line}`)]),
      ),
      subscribers: Object.fromEntries(
        [...subscribed].map(([key, value]) => [key, value.map((entry) => `${entry.file}:${entry.line}`)]),
      ),
    },
  };
}

/** EV-3 — subscriber location and naming convention. */
function checkSubscriber({ clean, matchIndex, file, line, owner, eventType }) {
  const findings = [];
  const window = clean.slice(Math.max(0, matchIndex - 60), matchIndex + 240);
  const nameMatch = /subscribe\s*\(\s*['"`][^'"`]+['"`]\s*,\s*['"`]([^'"`]+)['"`]/.exec(window);
  const subscriberName = nameMatch ? nameMatch[1] : null;

  if (!/\.subscribers\.ts$/.test(file)) {
    findings.push(
      finding({
        rule: 'EV-3',
        failureMode: 'F4',
        file,
        line,
        message: `Subscriber for '${eventType}' is registered outside a '<module>.subscribers.ts' file.`,
        hint: 'Register subscribers in src/modules/<module>/<module>.subscribers.ts and wire them from the module factory.',
      }),
    );
  }

  if (!subscriberName) {
    findings.push(
      finding({
        rule: 'EV-3',
        failureMode: 'F4',
        file,
        line,
        message: `Subscription to '${eventType}' has no subscriber name.`,
        hint: "Use subscribe(type, '<module>.<purpose>', handler) — the name identifies the owner in dead-letter logs.",
      }),
    );
  } else if (owner && !subscriberName.startsWith(`${owner}.`)) {
    findings.push(
      finding({
        rule: 'EV-3',
        failureMode: 'F4',
        file,
        line,
        message: `Subscriber name '${subscriberName}' does not start with its module '${owner}.'.`,
        hint: `Rename it to '${owner}.<purpose>' so dead-letter logs name the owning module.`,
      }),
    );
  }

  return findings;
}

/**
 * EV-7 — within a service file, flag a `publish(` that appears before any
 * repository write. Advisory because a legitimate read-only publisher exists
 * (a request/recompute trigger), but a write-then-publish inversion is a
 * real defect the Evaluator should look at.
 */
function checkPublishAfterWrite(clean, file) {
  const findings = [];
  const firstPublish = clean.search(/\bevents\s*\.\s*publish\s*\(/);
  const firstWrite = clean.search(/\brepository\s*\.\s*(save|saveMany|remove)\s*\(/);
  if (firstPublish !== -1 && firstWrite !== -1 && firstPublish < firstWrite) {
    findings.push(
      finding({
        severity: 'advisory',
        rule: 'EV-7',
        failureMode: 'F4',
        file,
        line: lineOf(clean, firstPublish),
        message: 'The first events.publish() in this service appears before the first repository write.',
        hint: 'Publish only after the write has succeeded, so no subscriber reacts to a state change that never landed.',
      }),
    );
  }
  return findings;
}

/** Reads the EVENT_OWNERS map straight out of the contracts file. */
function parseEventOwners(rootDir, files) {
  const owners = new Map();
  const contractFile = files.find((absolute) => toRel(rootDir, absolute) === CONTRACTS);
  if (!contractFile) return owners;

  const block = /EVENT_OWNERS[^=]*=\s*\{([\s\S]*?)\n\}/.exec(readSource(contractFile));
  if (!block) return owners;

  const entry = /['"`]([\w.]+)['"`]\s*:\s*['"`](\w+)['"`]/g;
  let match;
  while ((match = entry.exec(block[1])) !== null) {
    owners.set(match[1], match[2]);
  }
  return owners;
}

function moduleOf(relPath) {
  const match = /^src\/modules\/([^/]+)\//.exec(relPath);
  return match ? match[1] : null;
}

function record(map, key, value) {
  const existing = map.get(key) ?? [];
  existing.push(value);
  map.set(key, existing);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (isMain(import.meta.url)) {
  runAsCli(checkEvents);
}
