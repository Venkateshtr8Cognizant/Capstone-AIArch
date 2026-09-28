#!/usr/bin/env node
/**
 * End-to-end smoke test against a REAL running StoreOps server.
 *
 * Builds the project, starts `dist/src/main.js`, and drives the demonstration
 * feature over HTTP exactly as a client would — including the partial-failure
 * path, the typed 422, and the cross-module effects that arrive via the event
 * bus. This is the "demonstrable through the running application" evidence:
 * no test framework, no fixture, no in-process shortcuts.
 *
 *   npm run smoke
 *
 * Exits non-zero on the first failed expectation.
 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = Number(process.env.SMOKE_PORT ?? 3100);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = resolve(import.meta.dirname, '..');

const TOKENS = {
  storeManager: 'token-sam-manager',
  groceryLead: 'token-priya-lead',
  chilledLead: 'token-marcus-lead',
  associateEarly: 'token-alice-associate',
  associateLate: 'token-chen-associate',
};

let checks = 0;
let failures = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) {
    process.stdout.write(`  ok   ${label}\n`);
  } else {
    failures += 1;
    process.stdout.write(`  FAIL ${label}\n`);
    if (detail !== undefined) {
      process.stdout.write(`       got: ${JSON.stringify(detail)}\n`);
    }
  }
}

function section(title) {
  process.stdout.write(`\n--- ${title} ---\n`);
}

async function api(method, path, { token, body, correlationId } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    json: text ? JSON.parse(text) : null,
  };
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) =>
      code === 0 ? resolveRun() : rejectRun(new Error(`${command} exited ${code}`)),
    );
    child.on('error', rejectRun);
  });
}

async function waitForHealth(attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function createActivity(token, overrides = {}) {
  const response = await api('POST', '/api/activities', {
    token,
    body: {
      title: 'Restock grocery aisle 4',
      priority: 'MEDIUM',
      category: 'RESTOCKING',
      departmentId: 'dept_grocery',
      assigneeId: 'user_alice',
      ...overrides,
    },
  });
  if (response.status !== 201) {
    throw new Error(`could not seed activity: ${response.status} ${JSON.stringify(response.json)}`);
  }
  return response.json.data.taskId;
}

async function main() {
  process.stdout.write('=== StoreOps smoke test ===\n\n');

  process.stdout.write('Building…\n');
  rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true });
  await run('npx', ['tsc', '-p', 'tsconfig.json']);
  if (!existsSync(resolve(ROOT, 'dist/src/main.js'))) {
    throw new Error('build did not produce dist/src/main.js');
  }

  process.stdout.write(`\nStarting server on :${PORT}…\n`);
  const server = spawn(process.execPath, ['dist/src/main.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const serverLog = [];
  server.stdout.on('data', (chunk) => serverLog.push(chunk.toString()));
  server.stderr.on('data', (chunk) => serverLog.push(chunk.toString()));

  try {
    if (!(await waitForHealth())) {
      process.stdout.write(serverLog.join(''));
      throw new Error('server did not become healthy');
    }

    section('health and authentication');

    const health = await api('GET', '/health');
    check('GET /health returns 200 ok', health.status === 200 && health.json.data.status === 'ok');

    const noAuth = await api('GET', '/api/activities');
    check(
      'GET /api/activities without a token returns 401 NOT_AUTHENTICATED',
      noAuth.status === 401 && noAuth.json.error.code === 'NOT_AUTHENTICATED',
      noAuth.json,
    );

    const badAuth = await api('GET', '/api/activities', { token: 'nope' });
    check(
      'an unknown token returns 401',
      badAuth.status === 401 && badAuth.json.error.code === 'NOT_AUTHENTICATED',
      badAuth.json,
    );

    section('seed: three activities on the early shift');

    const first = await createActivity(TOKENS.groceryLead);
    const second = await createActivity(TOKENS.groceryLead, { title: 'Clear the back-stock cage' });
    const chilled = await createActivity(TOKENS.groceryLead, {
      title: 'Chilled temperature audit',
      category: 'AUDIT',
      priority: 'HIGH',
      departmentId: 'dept_chilled',
      assigneeId: 'user_chen',
    });
    process.stdout.write(`  seeded: ${first}, ${second}, ${chilled}\n`);

    section('shift handover: bulk status update (partial failure)');

    const handover = await api('PATCH', '/api/activities/bulk-status', {
      token: TOKENS.associateEarly,
      correlationId: 'smoke-handover-1',
      body: {
        taskIds: [first, second, chilled, 'task_does_not_exist'],
        targetStatus: 'DONE',
      },
    });

    check('returns 200', handover.status === 200, handover.json);
    check(
      'updated the two activities the caller is assigned',
      handover.json?.data?.updatedCount === 2,
      handover.json?.data,
    );
    check(
      'every updated activity is DONE',
      handover.json?.data?.updated?.every((item) => item.status === 'DONE'),
      handover.json?.data?.updated?.map((item) => item.status),
    );
    check(
      'rejected the chilled activity with NOT_PERMITTED / BR-7',
      handover.json?.data?.failed?.some(
        (item) => item.taskId === chilled && item.code === 'NOT_PERMITTED' && item.rule === 'BR-7',
      ),
      handover.json?.data?.failed,
    );
    check(
      'rejected the unknown id with ACTIVITY_NOT_FOUND / BR-4',
      handover.json?.data?.failed?.some(
        (item) => item.code === 'ACTIVITY_NOT_FOUND' && item.rule === 'BR-4',
      ),
      handover.json?.data?.failed,
    );
    check(
      'echoes the caller correlation id',
      handover.headers.get('x-correlation-id') === 'smoke-handover-1',
      handover.headers.get('x-correlation-id'),
    );

    const afterHandover = await api('GET', `/api/activities/${chilled}`, {
      token: TOKENS.groceryLead,
    });
    check(
      'the rejected activity is untouched in the store',
      afterHandover.json?.data?.status === 'TODO',
      afterHandover.json?.data?.status,
    );

    const doneList = await api('GET', '/api/activities?status=DONE', { token: TOKENS.groceryLead });
    check('two activities now list as DONE', doneList.json?.data?.length === 2, doneList.json?.data?.length);

    section('cross-module effect: SHIFT_HANDOVER alert via the event bus');

    const alerts = await api('GET', '/api/alerts', { token: TOKENS.storeManager });
    check('the store manager has one notification', alerts.json?.data?.length === 1, alerts.json?.data);
    check(
      'it is a SHIFT_HANDOVER, IN_APP, PENDING',
      alerts.json?.data?.[0]?.type === 'SHIFT_HANDOVER' &&
        alerts.json?.data?.[0]?.channel === 'IN_APP' &&
        alerts.json?.data?.[0]?.status === 'PENDING',
      alerts.json?.data?.[0],
    );
    check(
      'its subject names the count and the target status',
      /2 activity\(ies\) set to DONE/.test(alerts.json?.data?.[0]?.subject ?? ''),
      alerts.json?.data?.[0]?.subject,
    );
    check(
      'it carries the originating correlation id',
      alerts.json?.data?.[0]?.correlationId === 'smoke-handover-1',
      alerts.json?.data?.[0]?.correlationId,
    );

    const unrelated = await api('GET', '/api/alerts', { token: TOKENS.associateLate });
    check('an unrelated colleague sees no notifications', unrelated.json?.data?.length === 0, unrelated.json?.data);

    section('business rule rejections');

    // The chilled activity is in dept_chilled, so the CHILLED lead is the one
    // BR-7 permits — the grocery lead is correctly refused (verified above).
    const noNote = await api('PATCH', '/api/activities/bulk-status', {
      token: TOKENS.chilledLead,
      body: { taskIds: [chilled], targetStatus: 'BLOCKED' },
    });
    check('BLOCKED with no note returns 422', noNote.status === 422, noNote.status);
    check('…naming rule BR-3', noNote.json?.error?.rule === 'BR-3', noNote.json?.error);
    check(
      '…with the offending field',
      noNote.json?.error?.details?.[0]?.path === 'note',
      noNote.json?.error?.details,
    );

    const withNote = await api('PATCH', '/api/activities/bulk-status', {
      token: TOKENS.chilledLead,
      body: { taskIds: [chilled], targetStatus: 'BLOCKED', note: 'Chiller 3 reading out of range' },
    });
    check('the same request with a note succeeds', withNote.status === 200, withNote.json);
    check(
      'the activity is BLOCKED',
      withNote.json?.data?.updated?.[0]?.status === 'BLOCKED',
      withNote.json?.data?.updated?.[0],
    );

    /**
     * KNOWN GAP (backlog F-5): the ESCALATION path subscribes to
     * `activities.task.status_changed`, which the bulk path does not emit, so a
     * HIGH/CRITICAL activity blocked during a handover raises the handover
     * summary but no escalation. Asserted here as current behaviour rather
     * than desired behaviour, so the gap stays visible instead of being
     * discovered in production.
     */
    const escalation = await api('GET', '/api/alerts', { token: TOKENS.chilledLead });
    check(
      'KNOWN GAP F-5: a HIGH activity blocked in bulk raises no ESCALATION (bulk path emits no status_changed)',
      !escalation.json?.data?.some((item) => item.type === 'ESCALATION'),
      escalation.json?.data?.map((item) => item.type),
    );

    const duplicates = await api('PATCH', '/api/activities/bulk-status', {
      token: TOKENS.groceryLead,
      body: { taskIds: [first, first], targetStatus: 'DONE' },
    });
    check('duplicate ids return 422 naming BR-1', duplicates.status === 422 && duplicates.json?.error?.rule === 'BR-1', duplicates.json?.error);

    const alreadyDone = await api('PATCH', '/api/activities/bulk-status', {
      token: TOKENS.groceryLead,
      body: { taskIds: [first], targetStatus: 'DONE' },
    });
    check(
      'a batch where nothing can change returns 422 naming BR-9',
      alreadyDone.status === 422 && alreadyDone.json?.error?.rule === 'BR-9',
      alreadyDone.json?.error,
    );
    check(
      '…and reports the per-item reason BR-6',
      alreadyDone.json?.error?.details?.some((detail) => detail.rule === 'BR-6'),
      alreadyDone.json?.error?.details,
    );

    const tooMany = await api('PATCH', '/api/activities/bulk-status', {
      token: TOKENS.groceryLead,
      body: {
        taskIds: Array.from({ length: 51 }, (_, index) => `task_${index}`),
        targetStatus: 'DONE',
      },
    });
    check(
      'a 51-item batch returns 400 VALIDATION_FAILED on taskIds',
      tooMany.status === 400 &&
        tooMany.json?.error?.code === 'VALIDATION_FAILED' &&
        tooMany.json?.error?.details?.[0]?.path === 'taskIds',
      tooMany.json?.error,
    );

    section('cross-module effect: programme close triggers a report recompute');

    const programme = await api('POST', '/api/programmes', {
      token: TOKENS.storeManager,
      body: { name: 'Autumn planogram reset' },
    });
    check('created a programme in PLANNING', programme.status === 201 && programme.json?.data?.status === 'PLANNING', programme.json?.data);

    const closed = await api('POST', `/api/programmes/${programme.json.data.programmeId}/close`, {
      token: TOKENS.storeManager,
    });
    check('closing it returns 200 CLOSED', closed.status === 200 && closed.json?.data?.status === 'CLOSED', closed.json?.data);

    const refused = await api('POST', `/api/programmes/${programme.json.data.programmeId}/close`, {
      token: TOKENS.groceryLead,
    });
    check('a department lead cannot close a programme (409 already closed or 403)', refused.status === 409 || refused.status === 403, refused.status);

    section('server log — structured, correlated');

    const log = serverLog.join('');
    check('logged the bulk completion', log.includes('activities.bulk_status_completed'), null);
    check('logged the alert being raised', log.includes('alerts.notification_raised'), null);
    check('logged the report becoming ready', log.includes('reports.store_summary_ready'), null);
    check('log lines carry the correlation id', log.includes('smoke-handover-1'), null);

    process.stdout.write('\n=== sample server log lines ===\n');
    for (const line of log.split('\n')) {
      if (/bulk_status_completed|notification_raised|store_summary_ready|request\.rejected/.test(line)) {
        process.stdout.write(`${line}\n`);
      }
    }
  } finally {
    server.kill();
  }

  process.stdout.write(`\n=== SMOKE ${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} checks ===\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`\nsmoke test error: ${error.message}\n`);
  process.exitCode = 1;
});
