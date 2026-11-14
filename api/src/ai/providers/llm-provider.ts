import type { GenerationOptions } from './provider-limits.js';
export interface LlmProvider {
  generate(prompt: string, options?: GenerationOptions): Promise<string>;

  generateStream(
    prompt: string,
    options?: GenerationOptions,
  ): AsyncIterable<string>;
}
