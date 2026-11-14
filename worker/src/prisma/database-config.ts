// Generated from api/src/prisma/database-config.ts; edit the canonical API source.
import type { PoolConfig } from 'pg';

// Canonical API/worker TLS policy. Worker copy is derived by schema-sync.mjs.
export function databaseConfig(
  env: NodeJS.ProcessEnv = process.env,
  urlOnly = false,
): PoolConfig {
  const production = env.NODE_ENV === 'production';
  let config: PoolConfig;
  let host: string;
  if (production && !urlOnly) {
    for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'])
      if (!env[key]) throw new Error(`Missing ${key}`);
    host = env.DB_HOST!;
    config = {
      host,
      port: Number(env.DB_PORT ?? 5432),
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    };
  } else {
    if (!env.DATABASE_URL) throw new Error('Missing DATABASE_URL');
    const url = new URL(env.DATABASE_URL);
    if (!['postgresql:', 'postgres:'].includes(url.protocol))
      throw new Error('Invalid database protocol');
    // pg connection-string SSL parameters can override the explicit TLS policy.
    for (const key of url.searchParams.keys())
      if (/^ssl/i.test(key))
        throw new Error('Configure TLS using DB_SSL_MODE and DB_CA_CERT');
    host = url.hostname;
    config = { connectionString: url.href };
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(host);
  const mode =
    env.DB_SSL_MODE ?? (production || !local ? 'verify-full' : 'disable');
  if (!['verify-full', 'disable'].includes(mode))
    throw new Error('Invalid DB_SSL_MODE');
  if (mode === 'disable' && (production || !local))
    throw new Error('Database TLS is required outside local development');
  if (env.DB_CA_CERT && !env.DB_CA_CERT.includes('-----BEGIN CERTIFICATE-----'))
    throw new Error('Invalid DB_CA_CERT');
  return {
    ...config,
    ssl:
      mode === 'disable'
        ? false
        : {
            rejectUnauthorized: true,
            ...(env.DB_CA_CERT ? { ca: env.DB_CA_CERT } : {}),
          },
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  };
}
