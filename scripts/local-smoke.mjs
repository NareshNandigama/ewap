// Runs inside the API builder/migration image; no host npm installation required.
import assert from 'node:assert/strict';
import { get } from 'node:https';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const require = createRequire('/app/package.json');
const { io } = require('socket.io-client');
const { Pool } = require('pg');
const base = 'http://gateway:8080';
const suffix = randomUUID();
let token;
async function request(
  path,
  { method = 'GET', body, key, authenticated = true } = {},
) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    signal: AbortSignal.timeout(10000),
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.ok(response.ok, `${method} ${path} failed: HTTP ${response.status}`);
  return response.status === 204 ? undefined : response.json();
}
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, 'postgres');
assert.equal(url.pathname, '/ewap_local');
url.search = '';
const db = new Pool({
  connectionString: url.href,
  ssl: { rejectUnauthorized: true, ca: readFileSync('/tls/ca.crt', 'utf8') },
});
let socket;
try {
  assert.ok(
    (await fetch(`${base}/login`)).ok,
    'Frontend login page unavailable',
  );
  await new Promise((resolve, reject) => {
    get(
      'https://gateway:8443/login',
      { ca: readFileSync('/tls/ca.crt') },
      (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else reject(new Error(`HTTPS gateway returned ${response.statusCode}`));
      },
    )
      .on('error', reject)
      .setTimeout(10000, function () {
        this.destroy(new Error('HTTPS gateway timeout'));
      });
  });
  assert.equal(
    (await request('/health/ready', { authenticated: false })).status,
    'ready',
  );
  assert.equal(
    (await (await fetch(`${base}/python-health`)).json()).analysisMode,
    'deterministic',
  );
  assert.equal(
    (await db.query('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()'))
      .rows[0].ssl,
    true,
  );
  const plaintext = new Pool({ connectionString: url.href, ssl: false });
  try {
    await assert.rejects(plaintext.query('SELECT 1'));
  } finally {
    await plaintext.end();
  }

  const password = `Local-smoke-${suffix}`;
  const account = await request('/auth/register', {
    method: 'POST',
    authenticated: false,
    body: {
      organizationName: `Local smoke ${suffix}`,
      name: 'Smoke administrator',
      email: `smoke-${suffix}@example.invalid`,
      password,
    },
  });
  token = (
    await request('/auth/login', {
      method: 'POST',
      authenticated: false,
      body: { email: `smoke-${suffix}@example.invalid`, password },
    })
  ).accessToken;
  assert.ok(token);
  const project = await request(
    `/organizations/${account.organization.id}/projects`,
    { method: 'POST', body: { name: 'Compose smoke project' } },
  );
  const workflow = await request(`/projects/${project.id}/workflows`, {
    method: 'POST',
    body: { name: 'Compose smoke workflow' },
  });
  const updates = [];
  socket = io(base, { transports: ['websocket'], auth: { token } });
  socket.on('workflow.status.changed', (event) => updates.push(event));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Authenticated WebSocket not ready')),
      10000,
    );
    socket.once('workflow.updates.ready', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  const key = `local-smoke-${suffix}`;
  const run = await request(`/workflows/${workflow.id}/runs`, {
    method: 'POST',
    key,
  });
  const repeated = await request(`/workflows/${workflow.id}/runs`, {
    method: 'POST',
    key,
  });
  assert.equal(run.id, repeated.id, 'Run creation retry was not deduplicated');
  let current;
  for (let i = 0; i < 60; i++) {
    current = await request(`/workflow-runs/${run.id}`);
    if (
      current.status === 'SUCCESS' &&
      updates.some((e) => e.runId === run.id && e.status === 'SUCCESS')
    )
      break;
    await delay(500);
  }
  assert.equal(
    current.status,
    'SUCCESS',
    'Real broker/worker execution did not complete',
  );
  assert.ok(
    updates.some((e) => e.runId === run.id && e.status === 'SUCCESS'),
    'Worker callback/socket fan-out was not observed',
  );
  const report = await request('/ai/agent/diagnose', {
    method: 'POST',
    body: { question: 'What is the current outcome?', workflowRunId: run.id },
  });
  assert.equal(report.source, 'python-deterministic');
  assert.equal(report.diagnostics.executionStatus, 'SUCCESS');
  const sourceKey = `smoke-${suffix}`;
  await request(`/runbooks/${sourceKey}`, {
    method: 'PUT',
    body: {
      title: 'Local smoke runbook',
      content: 'Workflow success: check execution completion and logs.',
      expectedVersion: 0,
    },
  });
  const search = await request('/runbooks/search', {
    method: 'POST',
    body: { query: 'workflow success', mode: 'keyword' },
  });
  assert.ok(search.passages.some((p) => p.sourceKey === sourceKey));
  const grounded = await request('/ai/agent/diagnose', {
    method: 'POST',
    body: {
      question: 'workflow success',
      workflowRunId: run.id,
      retrievalMode: 'keyword',
    },
  });
  assert.equal(grounded.source, 'python-grounded');
  assert.equal(grounded.diagnostics.grounding.status, 'insufficient_evidence');
  await request(`/runbooks/${sourceKey}?expectedVersion=1`, {
    method: 'DELETE',
  });
  const foreign = await request('/auth/register', {
    method: 'POST',
    authenticated: false,
    body: {
      organizationName: `Foreign smoke ${suffix}`,
      name: 'Foreign administrator',
      email: `foreign-${suffix}@example.invalid`,
      password,
    },
  });
  const forbidden = await fetch(`${base}/api/v1/workflow-runs/${run.id}`, {
    headers: { Authorization: `Bearer ${foreign.accessToken}` },
  });
  assert.equal(forbidden.status, 404);
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        checks: [
          'frontend',
          'TLS database',
          'plaintext rejected',
          'JWT registration/login',
          'run idempotency',
          'RabbitMQ/worker execution',
          'authenticated status socket',
          'Python deterministic HTTP/TLS',
          'runbook search',
          'grounded abstention',
          'tenant isolation',
        ],
        fixtureRunId: run.id,
      },
      null,
      2,
    ),
  );
} finally {
  socket?.disconnect();
  await db.end();
}
