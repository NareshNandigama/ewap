import Anthropic from '@anthropic-ai/sdk';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmProvider } from './llm-provider.js';
import { providerScope, type GenerationOptions } from './provider-limits.js';

type ClaudeRequest = Omit<Anthropic.MessageCreateParamsNonStreaming, 'stream'>;

export class ClaudeProvider implements LlmProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  readonly cacheModel: string;

  constructor(config: ConfigService) {
    this.model = config.getOrThrow<string>('CLAUDE_MODEL');
    this.cacheModel = `anthropic:${this.model}`;
    this.client = new Anthropic({
      apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY'),
      maxRetries: 0,
      timeout: 30000,
    });
  }

  private request(prompt: string): ClaudeRequest {
    return {
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    };
  }

  async generate(prompt: string, options?: GenerationOptions): Promise<string> {
    return this.complete(prompt, options);
  }

  async generateWithWorkflowEvidence(
    prompt: string,
    evidence: string,
  ): Promise<string> {
    return this.complete(prompt, undefined, evidence);
  }

  private async complete(
    prompt: string,
    options?: GenerationOptions,
    evidence?: string,
  ): Promise<string> {
    const scope = providerScope(prompt + (evidence ?? ''), options);
    try {
      const request = this.request(prompt);
      const toolName = 'workflow_evidence';
      if (evidence !== undefined) {
        request.tools = [
          {
            name: toolName,
            description:
              'Return the authorized snapshot for the workflow run in this request.',
            input_schema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
        ];
        request.tool_choice = {
          type: 'tool',
          name: toolName,
          disable_parallel_tool_use: true,
        };
      }
      const send = (params: ClaudeRequest) =>
        scope.wait(
          this.client.messages.create(
            { ...params, stream: false },
            { signal: scope.signal },
          ),
        );
      let message = await send(request);
      if (evidence !== undefined) {
        const calls = message.content.filter(
          (block) => block.type === 'tool_use',
        );
        const call = calls[0];
        if (
          message.stop_reason !== 'tool_use' ||
          calls.length !== 1 ||
          call.name !== toolName ||
          !call.input ||
          typeof call.input !== 'object' ||
          Array.isArray(call.input) ||
          Object.keys(call.input).length !== 0
        )
          throw new Error('Invalid workflow evidence tool call');
        message = await send({
          ...request,
          tool_choice: { type: 'none' },
          messages: [
            ...request.messages,
            { role: 'assistant', content: message.content },
            {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: call.id,
                  content: evidence,
                },
              ],
            },
          ],
        });
      }
      if (message.stop_reason !== 'end_turn')
        throw new Error('Provider did not complete');
      return message.content
        .filter((block) => block.type === 'text')
        .map((block) => scope.checkOutput(block.text))
        .join('');
    } catch {
      scope.signal.throwIfAborted();
      throw new ServiceUnavailableException('Claude generation unavailable');
    } finally {
      scope.close();
    }
  }

  async *generateStream(
    prompt: string,
    options?: GenerationOptions,
  ): AsyncIterable<string> {
    const scope = providerScope(prompt, options);
    try {
      const stream = await scope.wait(
        this.client.messages.create(
          { ...this.request(prompt), stream: true },
          { signal: scope.signal },
        ),
      );
      const iterator = stream[Symbol.asyncIterator]();
      let stopReason: Anthropic.Message['stop_reason'] = null;
      while (true) {
        const { done, value } = await scope.wait(iterator.next());
        if (done) break;
        if (
          value.type === 'content_block_start' &&
          value.content_block.type === 'text' &&
          value.content_block.text
        )
          yield scope.checkOutput(value.content_block.text);
        if (
          value.type === 'content_block_delta' &&
          value.delta.type === 'text_delta'
        )
          yield scope.checkOutput(value.delta.text);
        if (value.type === 'message_delta')
          stopReason = value.delta.stop_reason;
        if (value.type === 'message_stop') {
          if (stopReason === 'end_turn') return;
          break;
        }
      }
      throw new Error('Provider stream ended without completion');
    } catch {
      scope.signal.throwIfAborted();
      throw new ServiceUnavailableException('Claude stream unavailable');
    } finally {
      scope.close();
    }
  }
}
