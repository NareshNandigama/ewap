import { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { describe, it, expect } from 'vitest';
import { WorkerStatusGuard } from './worker-status.guard.js';

const key = 'worker-test-' + 'x'.repeat(32);
const context = (value?: unknown) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-ewap-worker-key': value } }),
    }),
  }) as ExecutionContext;
describe('WorkerStatusGuard', () => {
  it('accepts the separate worker credential', () => {
    expect(
      new WorkerStatusGuard(
        new ConfigService({ WORKER_STATUS_API_KEY: key }),
      ).canActivate(context(key)),
    ).toBe(true);
  });
  it.each([undefined, 'wrong', [key], 'x'.repeat(513)])(
    'rejects missing/wrong/ambiguous credentials %#',
    (value) => {
      expect(() =>
        new WorkerStatusGuard(
          new ConfigService({ WORKER_STATUS_API_KEY: key }),
        ).canActivate(context(value)),
      ).toThrow('Invalid worker credentials');
    },
  );
  it('fails closed when not configured', () => {
    expect(() =>
      new WorkerStatusGuard(new ConfigService()).canActivate(context(key)),
    ).toThrow('not configured');
  });
  it.each(['', 'short', 'x'.repeat(513), 'é'.repeat(32)])(
    'rejects invalid configured keys %#',
    (value) => {
      expect(
        () =>
          new WorkerStatusGuard(
            new ConfigService({ WORKER_STATUS_API_KEY: value }),
          ),
      ).toThrow('WORKER_STATUS_API_KEY');
    },
  );
});
