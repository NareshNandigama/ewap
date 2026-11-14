import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    interactions = { create: mocks.create };
  },
}));
import { GeminiProvider } from './gemini.provider.js';
const provider = () =>
  new GeminiProvider(new ConfigService({ GEMINI_API_KEY: 'synthetic' }));
async function collect(stream: AsyncIterable<string>) {
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
}
describe('Gemini terminal states', () => {
  it('requires explicit provider completion after deltas', async () => {
    mocks.create.mockResolvedValue(
      (async function* () {
        yield {
          event_type: 'step.delta',
          delta: { type: 'text', text: 'answer' },
        };
        yield {
          event_type: 'interaction.completed',
          interaction: { status: 'completed' },
        };
      })(),
    );
    await expect(collect(provider().generateStream('question'))).resolves.toBe(
      'answer',
    );
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        generation_config: { max_output_tokens: 4096 },
      }),
      expect.objectContaining({
        maxRetries: 0,
        fetchOptions: { signal: expect.any(AbortSignal) },
      }),
    );
  });
  it('rejects truncated and explicit failed streams', async () => {
    mocks.create.mockResolvedValue(
      (async function* () {
        yield {
          event_type: 'step.delta',
          delta: { type: 'text', text: 'partial' },
        };
      })(),
    );
    await expect(
      collect(provider().generateStream('question')),
    ).rejects.toThrow('without completion');
    mocks.create.mockResolvedValue(
      (async function* () {
        yield { event_type: 'interaction.status_update', status: 'failed' };
      })(),
    );
    await expect(
      collect(provider().generateStream('question')),
    ).rejects.toThrow('did not complete');
  });
});
