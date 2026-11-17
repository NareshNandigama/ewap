import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import {
  EmbeddingClient,
  DIMENSIONS,
  validVector,
} from './embedding.client.js';
const vector = () => [1, ...Array(DIMENSIONS - 1).fill(0)];
const envelope = (data = [{ index: 0, embedding: vector() }]) => ({
  model: 'text-embedding-3-small',
  data,
});

describe('runbook embedding transport', () => {
  const client = () =>
    new EmbeddingClient(
      new ConfigService({ RUNBOOK_EMBEDDING_API_KEY: 'test-key' }),
    );
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('uses fixed HTTPS transport, bounded dimensions, and ordered output indexes', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(
        envelope([
          { index: 1, embedding: vector() },
          { index: 0, embedding: vector() },
        ]),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    expect(await client().embed(['one', 'two'])).toHaveLength(2);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(options.redirect).toBe('error');
    expect(JSON.parse(options.body)).toMatchObject({
      dimensions: 768,
      input: ['one', 'two'],
      encoding_format: 'float',
    });
  });
  it.each([
    { model: 'wrong-model', data: [] },
    envelope([]),
    envelope([{ index: 0, embedding: [1, 2] }]),
    envelope([{ index: 0, embedding: Array(DIMENSIONS).fill(0) }]),
    envelope([{ index: 99, embedding: vector() }]),
    envelope([
      { index: 0, embedding: vector() },
      { index: 0, embedding: vector() },
    ]),
  ])('rejects invalid model/index/vector payload %#', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await expect(client().embed(['one'])).rejects.toMatchObject({
      status: 503,
    });
  });
  it.each([401, 429, 503, 302])(
    'sanitizes HTTP %s and does not retry',
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response('private-provider-error', { status }));
      vi.stubGlobal('fetch', fetcher);
      await expect(client().embed(['one'])).rejects.toMatchObject({
        status: 503,
        message: 'Runbook embedding provider unavailable',
      });
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it('fails closed without credentials before network work', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      new EmbeddingClient(new ConfigService()).embed(['one']),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('bounds response size and rejects malformed JSON', async () => {
    for (const response of [
      new Response('x'.repeat(4 * 1024 * 1024 + 1), {
        headers: { 'content-type': 'application/json' },
      }),
      new Response('{', { headers: { 'content-type': 'application/json' } }),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(client().embed(['one'])).rejects.toMatchObject({
        status: 503,
      });
    }
  });
  it('propagates cancellation and enforces a deadline including response work', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            if (options.signal.aborted) reject(new Error());
            options.signal.addEventListener(
              'abort',
              () => reject(new Error()),
              { once: true },
            );
          }),
      ),
    );
    const promise = client().embed(['one']);
    const assertion = expect(promise).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    const cancel = new AbortController();
    const cancelled = client().embed(['one'], cancel.signal);
    const rejected = expect(cancelled).rejects.toMatchObject({ status: 503 });
    cancel.abort();
    await rejected;
  });
  it('rejects nonfinite and zero vectors', () => {
    expect(validVector([NaN, ...Array(767).fill(0)])).toBe(false);
    expect(validVector([Infinity, ...Array(767).fill(0)])).toBe(false);
    expect(validVector([1e-300, ...Array(767).fill(0)])).toBe(false);
    expect(validVector(vector())).toBe(true);
  });
});
