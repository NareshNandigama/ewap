import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { ConfigService } from '@nestjs/config';
import type { LlmProvider } from './llm-provider.js';
import { providerScope, type GenerationOptions } from './provider-limits.js';
export const GEMINI_MODEL = 'gemini-3.6-flash';
@Injectable()
export class GeminiProvider implements LlmProvider {
  private readonly ai: GoogleGenAI;
  constructor(configService: ConfigService) {
    this.ai = new GoogleGenAI({
      apiKey: configService.getOrThrow<string>('GEMINI_API_KEY'),
    });
  }
  async generate(prompt: string, options?: GenerationOptions): Promise<string> {
    const scope = providerScope(prompt, options);
    try {
      const interaction = await scope.wait(
        this.ai.interactions.create(
          {
            model: GEMINI_MODEL,
            input: prompt,
            generation_config: { max_output_tokens: 4096 },
          },
          {
            maxRetries: 0,
            timeout: 30000,
            fetchOptions: { signal: scope.signal },
          },
        ),
      );
      if (interaction.status !== 'completed')
        throw new Error('Provider did not complete');
      return scope.checkOutput(interaction.output_text ?? '');
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
        this.ai.interactions.create(
          {
            model: GEMINI_MODEL,
            input: prompt,
            stream: true,
            generation_config: { max_output_tokens: 4096 },
          },
          {
            maxRetries: 0,
            timeout: 30000,
            fetchOptions: { signal: scope.signal },
          },
        ),
      );
      const iterator = stream[Symbol.asyncIterator]();
      let complete = false;
      while (true) {
        const result = await scope.wait(iterator.next());
        if (result.done) break;
        const event = result.value;
        if (event.event_type === 'error')
          throw new Error('Provider stream failed');
        if (
          event.event_type === 'interaction.status_update' &&
          !['queued', 'in_progress', 'completed'].includes(event.status)
        )
          throw new Error('Provider stream did not complete');
        if (event.event_type === 'interaction.completed') {
          if (event.interaction.status !== 'completed')
            throw new Error('Provider stream did not complete');
          complete = true;
        }
        if (event.event_type === 'step.delta' && event.delta.type === 'text')
          yield scope.checkOutput(event.delta.text);
      }
      if (!complete)
        throw new Error('Provider stream ended without completion');
    } finally {
      scope.close();
    }
  }
}
