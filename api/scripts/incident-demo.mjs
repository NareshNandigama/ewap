import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import pg from 'pg';

const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
const [command, manifestPath, liveFlag] = process.argv.slice(2);
const primaryQuestion = 'connection timeout';
const conflictQuestion = 'rollback window';
const currentGuidance =
  'For a connection timeout, compare worker and gateway timestamps and inspect broker connectivity.';

function localOrigin(value) {
  const url = new URL(value);
  assert.ok(
    ['http:', 'https:'].includes(url.protocol) &&
      loopback.has(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash,
    'Use a loopback API origin',
  );
  return url.origin;
}

async function request(origin, route, { method = 'GET', token, body } = {}) {
  const response = await fetch(new URL(`/api/v1${route}`, origin), {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(40000),
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    await response.body?.cancel();
    return { status: response.status };
  }
  return { status: response.status, data: await response.json() };
}

async function success(origin, route, options) {
  const response = await request(origin, route, options);
  assert.ok(
    response.data !== undefined,
    `${route} returned HTTP ${response.status}`,
  );
  return response.data;
}

async function register(origin, name, suffix) {
  const credentials = {
    email: `${name}-${suffix}@example.invalid`,
    password: randomBytes(24).toString('hex'),
  };
  const registration = await success(origin, '/auth/register', {
    method: 'POST',
    body: {
      ...credentials,
      name: 'Incident demo administrator',
      organizationName: `Synthetic incident demo (${name} ${suffix})`,
    },
  });
  return { credentials, ...registration };
}

async function createRuns(db, workflowId, organizationId) {
  const fixtures = {
    failedRelease: [
      ['INFO', 'Release job submitted to the worker.'],
      ['WARN', 'Release gateway reported a connection timeout.'],
      ['ERROR', 'Worker connection timeout after retry; release stopped.'],
    ],
    missingEvidence: [
      ['INFO', 'Release stopped before diagnostic logs were collected.'],
    ],
    conflictingGuidance: [
      ['ERROR', 'Release blocked by a rollback window policy disagreement.'],
    ],
  };
  const runIds = {};
  await db.query('BEGIN');
  try {
    const owner = await db.query(
      'SELECT 1 FROM "Workflow" w JOIN "Project" p ON p.id = w."projectId" WHERE w.id = $1 AND p."organizationId" = $2',
      [workflowId, organizationId],
    );
    assert.equal(
      owner.rowCount,
      1,
      'API and database must point to the same local organization',
    );
    for (const [name, logs] of Object.entries(fixtures)) {
      const runId = randomUUID();
      const start = Date.now() - 60000;
      await db.query(
        'INSERT INTO "WorkflowRun" (id, "workflowId", status, "createdAt", "completedAt") VALUES ($1, $2, \'FAILED\', $3, $4)',
        [
          runId,
          workflowId,
          new Date(start),
          new Date(start + logs.length * 1000),
        ],
      );
      for (const [index, [level, message]] of logs.entries()) {
        await db.query(
          'INSERT INTO "WorkflowExecutionLog" (id, "workflowRunId", level, message, "createdAt") VALUES ($1, $2, $3, $4, $5)',
          [randomUUID(), runId, level, message, new Date(start + index * 1000)],
        );
      }
      runIds[name] = runId;
    }
    await db.query('COMMIT');
    return runIds;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

async function seed() {
  const origin = localOrigin(
    process.env.EWAP_DEMO_API_ORIGIN ?? 'http://127.0.0.1:3000',
  );
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(
    ['postgresql:', 'postgres:'].includes(url.protocol) &&
      loopback.has(url.hostname) &&
      url.pathname === '/ewap' &&
      !url.search &&
      !url.hash,
    'The incident demo requires the standalone loopback ewap database',
  );
  const db = new pg.Client({
    connectionString: url.href,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  await db.connect();
  try {
    const suffix = randomUUID().slice(0, 8);
    const own = await register(origin, 'release-ops', suffix);
    const foreign = await register(origin, 'other-team', suffix);
    const token = own.accessToken;
    const project = await success(
      origin,
      `/organizations/${own.organization.id}/projects`,
      {
        method: 'POST',
        token,
        body: { name: 'Synthetic release incident' },
      },
    );
    const workflow = await success(
      origin,
      `/projects/${project.id}/workflows`,
      {
        method: 'POST',
        token,
        body: { name: 'Release workflow' },
      },
    );
    const runIds = await createRuns(db, workflow.id, own.organization.id);
    const runbook = (key, content, version, accessToken = token) =>
      success(origin, `/runbooks/${key}`, {
        method: 'PUT',
        token: accessToken,
        body: { title: key, content, expectedVersion: version },
      });
    await runbook(
      'worker-timeout',
      'For a connection timeout, check the retired worker health page.',
      0,
    );
    await runbook('worker-timeout', currentGuidance, 1);
    await runbook(
      'other-team-timeout',
      'For a connection timeout, contact the other team.',
      0,
      foreign.accessToken,
    );
    await runbook(
      'rollback-window-release',
      'During the rollback window, proceed with rollback once the release lead approves.',
      0,
    );
    await runbook(
      'rollback-window-freeze',
      'During the rollback window, do not proceed with rollback even if the release lead approves.',
      0,
    );
    const folder = await mkdtemp(join(tmpdir(), 'ewap-incident-'));
    const path = join(folder, 'demo.json');
    await writeFile(
      path,
      JSON.stringify(
        {
          origin,
          runIds,
          owner: own.credentials,
          foreign: foreign.credentials,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    console.log(JSON.stringify({ manifestPath: path, runIds }, null, 2));
  } finally {
    await db.end();
  }
}

async function verifyHandoff(origin, token, runId) {
  const client = new Client({ name: 'incident-demo', version: '0.1.0' });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL('./mcp-server.mjs', import.meta.url))],
        env: { EWAP_MCP_API_ORIGIN: origin, EWAP_MCP_TOKEN: token },
      }),
    );
    const run = await client.callTool({
      name: 'get_workflow_run',
      arguments: { runId },
    });
    assert.ok(!run.isError, 'MCP workflow handoff read failed');
    assert.equal(JSON.parse(run.content[0].text).status, 'FAILED');
    const search = await client.callTool({
      name: 'search_runbooks',
      arguments: { query: primaryQuestion, limit: 1 },
    });
    assert.ok(!search.isError, 'MCP handoff runbook search failed');
    const [passage] = JSON.parse(search.content[0].text).passages;
    assert.equal(passage.sourceKey, 'worker-timeout');
    assert.equal(passage.version, 2);
  } finally {
    await client.close();
  }
}

async function check(path, live) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  const origin = localOrigin(fixture.origin);
  const login = async (body) =>
    (await success(origin, '/auth/login', { method: 'POST', body }))
      .accessToken;
  const [token, foreignToken] = await Promise.all([
    login(fixture.owner),
    login(fixture.foreign),
  ]);
  const search = (query, accessToken) =>
    success(origin, '/runbooks/search', {
      method: 'POST',
      token: accessToken,
      body: { query, mode: 'keyword', limit: 5 },
    });
  const own = await search(primaryQuestion, token);
  const foreign = await search(primaryQuestion, foreignToken);
  assert.deepEqual(
    own.passages.map(({ sourceKey, version }) => [sourceKey, version]),
    [['worker-timeout', 2]],
  );
  assert.deepEqual(
    foreign.passages.map(({ sourceKey }) => sourceKey),
    ['other-team-timeout'],
  );
  const forbidden = await request(
    origin,
    `/workflow-runs/${fixture.runIds.failedRelease}`,
    { token: foreignToken },
  );
  assert.equal(forbidden.status, 404);
  const conflicts = await search(conflictQuestion, token);
  assert.deepEqual(
    conflicts.passages.map(({ sourceKey }) => sourceKey).sort(),
    ['rollback-window-freeze', 'rollback-window-release'],
  );
  const diagnose = (runId, question) =>
    request(origin, '/ai/agent/diagnose', {
      method: 'POST',
      token,
      body: {
        workflowRunId: runId,
        question,
        retrievalMode: 'keyword',
        groundingProvider: 'gemini',
      },
    });
  const empty = await diagnose(fixture.runIds.missingEvidence, primaryQuestion);
  assert.equal(empty.data?.source, 'gemini-grounded');
  assert.equal(
    empty.data.diagnostics.grounding.status,
    'insufficient_evidence',
  );
  assert.equal(empty.data.diagnostics.analysisMode, 'deterministic');
  assert.ok(empty.data.diagnostics.nextSteps.some((step) => step.includes('warning or error log')));

  await verifyHandoff(origin, token, fixture.runIds.failedRelease);
  const scorecard = {
    currentRevision: 'passed',
    tenantIsolation: 'passed',
    conflictingPassages: 'passed',
    noEvidenceAbstention: 'passed',
    mcpHandoff: 'passed',
    live: [],
  };
  if (live) {
    for (const [name, question, expected] of [
      ['failedRelease', primaryQuestion, 'supported_observations'],
      ['conflictingGuidance', conflictQuestion, 'insufficient_evidence'],
    ]) {
      const start = performance.now();
      const result = await diagnose(fixture.runIds[name], question);
      const diagnostics = result.data?.diagnostics;
      const evidence = diagnostics?.grounding;
      const validRelease =
        name !== 'failedRelease' ||
        (evidence?.observations.length > 0 &&
          evidence.observations.every(
            (o) =>
              o.claim === o.log_quote &&
              currentGuidance.includes(o.passage_quote),
          ) &&
          evidence.passages.every(
            (p) => p.sourceKey === 'worker-timeout' && p.version === 2,
          ));
      const validConflict =
        name !== 'conflictingGuidance' ||
        new Set(
          diagnostics?.conflictingGuidance?.map(({ sourceKey }) => sourceKey),
        ).size === 2;
      const passed =
        result.data?.source === 'gemini-grounded' &&
        diagnostics?.analysisMode === 'llm' &&
        diagnostics.rootCause.status === 'undetermined' &&
        evidence?.status === expected &&
        validRelease &&
        validConflict;
      scorecard.live.push({
        case: name,
        passed,
        httpStatus: result.status,
        outcome: evidence?.status,
        latencyMs: Math.round(performance.now() - start),
        usage: diagnostics?.usage ?? null,
      });
      if (!passed) {
        process.exitCode = 1;
        break;
      }
    }
  }
  console.log(JSON.stringify(scorecard, null, 2));
}

try {
  if (command === 'seed') await seed();
  else if (
    command === 'check' &&
    manifestPath &&
    (!liveFlag || liveFlag === '--live')
  )
    await check(manifestPath, liveFlag === '--live');
  else
    throw new Error(
      'Usage: incident-demo.mjs seed | check <manifest-path> [--live]',
    );
} catch (error) {
  console.error(`Incident demo failed: ${error.message}`);
  process.exitCode = 1;
}
