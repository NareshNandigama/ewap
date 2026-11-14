import OpenAI from 'openai';
import type { LlmProvider } from './llm-provider.js';
import { providerScope, type GenerationOptions } from './provider-limits.js';
export class OpenAiProvider implements LlmProvider {
  private readonly openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 30000,
  });
  async generate(prompt: string, options?: GenerationOptions): Promise<string> {
    const scope = providerScope(prompt, options);
    try {
      const response = await scope.wait(
        this.openai.responses.create(
          {
            model: 'gpt-5.5',
            input: prompt,
            max_output_tokens: 4096,
          },
          { signal: scope.signal },
        ),
      );
      if (response.status !== 'completed')
        throw new Error('Provider did not complete');
      return scope.checkOutput(response.output_text);
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
        this.openai.responses.create(
          {
            model: 'gpt-5.5',
            input: prompt,
            stream: true,
            max_output_tokens: 4096,
          },
          { signal: scope.signal },
        ),
      );
      const iterator = stream[Symbol.asyncIterator]();
      let complete = false;
      while (true) {
        const result = await scope.wait(iterator.next());
        if (result.done) break;
        const event = result.value;
        if (
          ['response.failed', 'response.incomplete', 'error'].includes(
            event.type,
          )
        )
          throw new Error('Provider stream failed');
        if (event.type === 'response.completed') {
          if (event.response.status !== 'completed')
            throw new Error('Provider did not complete');
          complete = true;
        }
        if (event.type === 'response.output_text.delta')
          yield scope.checkOutput(event.delta);
      }
      if (!complete)
        throw new Error('Provider stream ended without completion');
    } finally {
      scope.close();
    }
  }
}
