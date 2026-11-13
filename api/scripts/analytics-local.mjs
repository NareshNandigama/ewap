import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Never load api/.env: these commands may only target the dedicated local DB.
const apiRoot = fileURLToPath(new URL('../', import.meta.url));
if (!process.env.ANALYTICS_TEST_DATABASE_URL) {
  process.loadEnvFile(
    fileURLToPath(new URL('../../.env.analytics-local', import.meta.url)),
  );
}
const url = new URL(process.env.ANALYTICS_TEST_DATABASE_URL);
if (
  !['postgres:', 'postgresql:'].includes(url.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  url.pathname !== '/ewap_analytics_test' ||
  url.username !== 'analytics_owner' ||
  url.search ||
  url.hash
) {
  throw new Error(
    'Only a loopback analytics_owner connection to ewap_analytics_test is permitted',
  );
}
const command = process.argv[2];
const args =
  command === 'migrate'
    ? ['node_modules/prisma/build/index.js', 'migrate', 'deploy']
    : [
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        command === 'status'
          ? 'vitest.config.workflow-status.ts'
          : command === 'membership'
            ? 'vitest.config.membership.ts'
            : 'vitest.config.analytics.ts',
        command === 'status'
          ? 'test/workflow-status.database.ts'
          : command === 'membership'
            ? 'test/membership.database.ts'
            : command === 'test'
              ? 'test/analytics.database.ts'
              : 'test/analytics.explain.ts',
      ];
if (!['migrate', 'test', 'explain', 'membership', 'status'].includes(command))
  throw new Error('Expected migrate, test, explain, membership, or status');
const result = spawnSync(process.execPath, args, {
  cwd: apiRoot,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url.href },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
