// Environment-only compiled API startup against an isolated TLS test database.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
const url = new URL(process.env.ANALYTICS_TEST_DATABASE_URL ?? '');
if (
  url.hostname !== '127.0.0.1' ||
  url.username !== 'analytics_owner' ||
  url.pathname !== '/ewap_analytics_test'
)
  throw new Error(
    'Only the isolated loopback analytics test database is permitted',
  );
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const cwd = mkdtempSync(join(tmpdir(), 'ewap-startup-host-'));
const child = spawn(
  process.execPath,
  [fileURLToPath(new URL('../dist/main.js', import.meta.url))],
  {
    cwd,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      DB_HOST: url.hostname,
      DB_PORT: url.port,
      DB_NAME: 'ewap_analytics_test',
      DB_USER: 'analytics_owner',
      DB_PASSWORD: 'synthetic',
      DB_CA_CERT: readFileSync(process.env.HARDENING_TLS_CERT, 'utf8'),
      JWT_SECRET: 'synthetic-startup-jwt-key',
      GEMINI_API_KEY: 'synthetic-no-model-calls',
      FRONTEND_URL: 'http://localhost:3000',
      ENABLE_MESSAGING: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';
child.stdout.on('data', (chunk) => {
  output = (output + chunk).slice(-8000);
});
child.stderr.on('data', (chunk) => {
  output = (output + chunk).slice(-8000);
});
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null)
      throw new Error('API exited before readiness: ' + output);
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/v1/health/ready`,
        { signal: AbortSignal.timeout(500) },
      );
      ready = response.ok && (await response.json()).status === 'ready';
      if (ready) break;
    } catch {
      /* Wait for startup. */
    }
    await delay(100);
  }
  if (!ready) throw new Error('API not ready: ' + output);
  console.log(
    'Compiled production API ready with verified TLS and injected DB_*; no .env or DATABASE_URL',
  );
} finally {
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(force);
  }
  rmSync(cwd, { recursive: true, force: true });
}
