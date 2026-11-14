import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('openai', () => ({
  default: class {
    responses = { create: mocks.create };
  },
}));
import { OpenAiProvider } from './openai.provider.js';
async function collect(stream: AsyncIterable<string>) {
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
}
afterEach(() => vi.useRealTimers());
describe('OpenAI terminal and cancellation handling', () => {
  it('requires completion after deltas', async () => {
    mocks.create.mockResolvedValue(
      (async function* () {
        yield { type: 'response.output_text.delta', delta: 'answer' };
        yield { type: 'response.completed', response: { status: 'completed' } };
      })(),
    );
    await expect(
      collect(new OpenAiProvider().generateStream('question')),
    ).resolves.toBe('answer');
  });
  it.each(['response.failed', 'response.incomplete', 'error'])(
    'rejects %s',
    async (type) => {
      mocks.create.mockResolvedValue(
        (async function* () {
          yield { type };
        })(),
      );
      await expect(
        collect(new OpenAiProvider().generateStream('question')),
      ).rejects.toThrow('failed');
    },
  );
  it('aborts a stalled SDK request when the client cancels', async () => {
    mocks.create.mockReturnValue(new Promise(() => {}));
    const abort = new AbortController();
    const pending = new OpenAiProvider().generate('question', {
      signal: abort.signal,
    });
    const expected = expect(pending).rejects.toThrow();
    const requestSignal = mocks.create.mock.calls.at(-1)?.[1].signal;
    abort.abort();
    await expected;
    expect(requestSignal.aborted).toBe(true);
  });
});
