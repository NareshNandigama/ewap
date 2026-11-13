import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerStatusClient } from './worker-status.client.js';

const key = 'worker-test-' + 'x'.repeat(32);
describe('WorkerStatusClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const create = (overrides = {}) =>
    new WorkerStatusClient(
      new ConfigService({
        WORKER_STATUS_API_KEY: key,
        WORKER_API_BASE_URL: 'http://127.0.0.1:3000',
        WORKER_STATUS_TIMEOUT_MS: 100,
        ...overrides,
      }),
    );
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('sends only the worker credential and bounded status body without redirects', async () => {
    fetchMock.mockResolvedValue(Response.json({ success: true }));
    await expect(create().notify('run-1', 'RUNNING')).resolves.toBe(true);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3000/api/v1/workflow-runs/status');
    expect(options.headers['X-EWAP-Worker-Key']).toBe(key);
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.redirect).toBe('error');
    expect(JSON.parse(options.body)).toEqual({
      runId: 'run-1',
      status: 'RUNNING',
    });
  });
  it('treats an obsolete callback as harmless', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 409 }));
    await expect(create().notify('run-1', 'RUNNING')).resolves.toBe(true);
  });
  it.each([401, 403, 404, 500, 503])(
    'does not turn HTTP %s into workflow failure',
    async (status) => {
      fetchMock.mockResolvedValue(new Response('private response', { status }));
      await expect(create().notify('run-1', 'RUNNING')).resolves.toBe(false);
    },
  );
  it('does not propagate network errors to execution', async () => {
    fetchMock.mockRejectedValue(new Error('private error details'));
    await expect(create().notify('run-1', 'RUNNING')).resolves.toBe(false);
  });
  it('aborts stalled notifications at the deadline', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const pending = create().notify('run-1', 'RUNNING');
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toBe(false);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('retains the legacy origin setting during configuration rollout', () => {
    expect(() =>
      create({
        WORKER_API_BASE_URL: undefined,
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3000',
      }),
    ).not.toThrow();
  });
  it.each([
    { WORKER_STATUS_API_KEY: undefined },
    { WORKER_STATUS_API_KEY: 'short' },
    { WORKER_API_BASE_URL: 'http://remote.example' },
    { WORKER_API_BASE_URL: 'https://example.com/api/v1' },
    { WORKER_API_BASE_URL: 'https://user:secret@example.com' },
    { WORKER_STATUS_TIMEOUT_MS: 0 },
  ])('rejects unsafe startup configuration %#', (overrides) => {
    expect(() => create(overrides)).toThrow();
  });
});
