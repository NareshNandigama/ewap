// Host PostgreSQL TLS fixture check, independent from Docker availability.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { databaseConfig } from '../src/prisma/database-config.ts';
const url = new URL(process.env.ANALYTICS_TEST_DATABASE_URL ?? '');
if (
  url.hostname !== '127.0.0.1' ||
  url.username !== 'analytics_owner' ||
  url.pathname !== '/ewap_analytics_test'
)
  throw new Error(
    'Only the isolated loopback analytics test database is permitted',
  );
const ca = readFileSync(process.env.HARDENING_TLS_CERT, 'utf8');
const env = {
  NODE_ENV: 'production',
  DB_HOST: url.hostname,
  DB_PORT: url.port,
  DB_NAME: 'ewap_analytics_test',
  DB_USER: 'analytics_owner',
  DB_PASSWORD: 'synthetic',
  DB_CA_CERT: ca,
};
const config = databaseConfig(env);
async function connect(configuration) {
  const client = new Client(configuration);
  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end().catch(() => undefined);
  }
}
await connect(config);
await assert.rejects(
  connect(databaseConfig({ ...env, DB_CA_CERT: undefined })),
  /certificate|self.signed/i,
);
await assert.rejects(
  connect({
    ...config,
    ssl: { ...config.ssl, servername: 'wrong-host.example.invalid' },
  }),
  /hostname|altnames|IP|certificate/i,
);
console.log(
  '3 TLS checks passed: trusted CA accepted; untrusted CA and hostname mismatch rejected',
);
