import { loadLocalEnvironment } from './local-environment.js';
import { environmentSchema } from './environment.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const base = {
  JWT_SECRET: 'synthetic-test-secret', FRONTEND_URL: 'http://localhost:3000',
  GEMINI_API_KEY: 'synthetic-key', ENABLE_MESSAGING: false,
};
const production = {
  ...base, NODE_ENV: 'production', DB_HOST: 'localhost', DB_NAME: 'synthetic',
  DB_USER: 'synthetic', DB_PASSWORD: 'synthetic',
};
const validate = (value: object) => environmentSchema.validate(value);

describe('runtime environment validation', () => {
  it('accepts production DB fields without DATABASE_URL', () => {
    const result = validate(production);
    expect(result.error).toBeUndefined();
    expect(result.value.DB_PORT).toBe(5432);
  });
  for (const field of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'FRONTEND_URL']) {
    it(`rejects missing ${field}`, () => {
      const value = { ...production };
      delete value[field];
      expect(validate(value).error).toBeDefined();
    });
  }
  it('requires development DATABASE_URL', () => {
    expect(validate(base).error).toBeDefined();
    expect(validate({ ...base, DATABASE_URL: 'postgresql://user:pass@localhost/db' }).error).toBeUndefined();
  });
  it('requires broker settings only when enabled, including string booleans', () => {
    expect(validate({ ...production, ENABLE_MESSAGING: 'false' }).error).toBeUndefined();
    expect(validate({ ...production, ENABLE_MESSAGING: 'true' }).error).toBeDefined();
    expect(validate({ ...production, ENABLE_MESSAGING: true, RABBITMQ_URL: 'amqp://localhost', RABBITMQ_QUEUE: 'workflow' }).error).toBeUndefined();
  });
  for (const overrides of [{ PORT: 0 }, { DB_PORT: 65536 }, { PORT: 3.5 }, { FRONTEND_URL: 'bad' }]) {
    it(`rejects invalid configuration ${JSON.stringify(overrides)}`, () => {
      expect(validate({ ...production, ...overrides }).error).toBeDefined();
    });
  }
});

describe('local environment loading in a fresh process', () => {
  const loader = resolve('src/config/local-environment.ts');
  function run(contents?: string) {
    const cwd = mkdtempSync(join(tmpdir(), 'ewap-env-'));
    try {
      if (contents !== undefined) writeFileSync(join(cwd, '.env'), contents);
      return spawnSync(process.execPath, ['--input-type=module', '-e',
        `import { loadLocalEnvironment } from ${JSON.stringify(loader)}; loadLocalEnvironment(); console.log(process.env.EWAP_STARTUP_TEST);`,
      ], { cwd, env: { EWAP_STARTUP_TEST: 'injected' }, encoding: 'utf8' });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
  it('boots the loader without a dotenv file', () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('injected');
  });
  it('preserves injected variables over local dotenv values', () => {
    const result = run('EWAP_STARTUP_TEST=local\n');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('injected');
  });
});

describe('local environment error handling', () => {
  it('propagates file errors other than ENOENT', () => {
    const failure = Object.assign(new Error('synthetic permission failure'), { code: 'EACCES' });
    const spy = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => { throw failure; });
    try {
      expect(() => loadLocalEnvironment()).toThrow(failure);
    } finally {
      spy.mockRestore();
    }
  });
});
