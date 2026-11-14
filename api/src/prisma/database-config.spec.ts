import { describe, expect, it } from 'vitest';
import { databaseConfig } from './database-config.js';
const production = {
  NODE_ENV: 'production',
  DB_HOST: 'db.example.invalid',
  DB_NAME: 'db',
  DB_USER: 'test',
  DB_PASSWORD: 'synthetic',
};
describe('database TLS policy', () => {
  it('verifies production certificates by default', () => {
    expect(databaseConfig(production).ssl).toEqual({
      rejectUnauthorized: true,
    });
  });
  it('rejects disabled production and remote development TLS', () => {
    expect(() =>
      databaseConfig({ ...production, DB_SSL_MODE: 'disable' }),
    ).toThrow('TLS');
    expect(() =>
      databaseConfig({
        DATABASE_URL: 'postgresql://test:synthetic@remote.invalid/db',
        DB_SSL_MODE: 'disable',
      }),
    ).toThrow('TLS');
  });
  it('allows local development and validates a custom CA', () => {
    expect(
      databaseConfig({
        DATABASE_URL: 'postgresql://test:synthetic@localhost/db',
      }).ssl,
    ).toBe(false);
    expect(() =>
      databaseConfig({ ...production, DB_CA_CERT: 'invalid' }),
    ).toThrow('DB_CA_CERT');
  });
  it('rejects connection URL overrides of the explicit SSL policy', () => {
    for (const setting of [
      'sslmode=no-verify',
      'sslmode=disable',
      'sslcert=anything',
    ])
      expect(() =>
        databaseConfig({
          DATABASE_URL: `postgresql://test:synthetic@localhost/db?${setting}`,
        }),
      ).toThrow('Configure TLS');
  });
});
