import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaudeProvider } from './claude.provider.js';

const provider = () =>
  new ClaudeProvider(
    new ConfigService({
      ANTHROPIC_API_KEY: 'synthetic',
      CLAUDE_MODEL: 'claude-test',
    }),
  );

function sse(events: Array<{ type: string }>) {
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('Claude provider', () => {
  it('returns completed text and uses the configured model and output limit', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'diagnosis' }],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(provider().generate('Question')).resolves.toBe('diagnosis');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      model: 'claude-test',
      max_tokens: 4096,
      messages: [{ role: 'user', content: 'Question' }],
    });
  });

  it.each([true, false])(
    'requires a completion event for streaming (%s)',
    async (complete) => {
      const delta = {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'partial' },
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          sse(
            complete
              ? [
                  delta,
                  {
                    type: 'message_delta',
                    delta: { stop_reason: 'end_turn' },
                  },
                  { type: 'message_stop' },
                ]
              : [delta],
          ),
        ),
      );
      const stream = provider()
        .generateStream('Question')
        [Symbol.asyncIterator]();
      await expect(stream.next()).resolves.toEqual({
        done: false,
        value: 'partial',
      });
      if (complete)
        await expect(stream.next()).resolves.toMatchObject({ done: true });
      else
        await expect(stream.next()).rejects.toThrow(
          'Claude stream unavailable',
        );
    },
  );

  it('sanitizes provider failures without retries', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: 'private response' }, { status: 429 }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(provider().generate('Question')).rejects.toThrow(
      'Claude generation unavailable',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns only the supplied workflow snapshot in one tool round trip', async () => {
    const call = {
      type: 'tool_use',
      id: 'tool-1',
      name: 'workflow_evidence',
      input: {},
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ stop_reason: 'tool_use', content: [call] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'diagnosis' }],
        }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(
      provider().generateWithWorkflowEvidence(
        'Question',
        'authorized evidence',
      ),
    ).resolves.toBe('diagnosis');
    expect(fetch).toHaveBeenCalledTimes(2);
    const initial = JSON.parse(fetch.mock.calls[0][1].body);
    expect(initial.tool_choice).toMatchObject({
      type: 'tool',
      name: 'workflow_evidence',
    });
    expect(JSON.stringify(initial)).not.toContain('authorized evidence');
    const followup = JSON.parse(fetch.mock.calls[1][1].body);
    expect(followup.tool_choice).toEqual({ type: 'none' });
    expect(followup.messages.slice(1)).toEqual([
      { role: 'assistant', content: [call] },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-1',
            content: 'authorized evidence',
          },
        ],
      },
    ]);
  });

  it('rejects unexpected tool arguments before sending evidence', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'workflow_evidence',
            input: { runId: 'other-run' },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(
      provider().generateWithWorkflowEvidence(
        'Question',
        'authorized evidence',
      ),
    ).rejects.toThrow('Claude generation unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('forwards cancellation to the provider', async () => {
    const controller = new AbortController();
    const fetch = vi.fn((_url, options: RequestInit) => {
      expect(options.signal?.aborted).toBe(false);
      controller.abort();
      expect(options.signal?.aborted).toBe(true);
      return Promise.reject(options.signal?.reason);
    });
    vi.stubGlobal('fetch', fetch);
    await expect(
      provider().generate('Question', { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
