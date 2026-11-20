import type { GenerationOptions } from './provider-limits.js';
export interface LlmProvider {
  readonly cacheModel?: string;
  generate(prompt: string, options?: GenerationOptions): Promise<string>;
  generateWithWorkflowEvidence?(
    prompt: string,
    evidence: string,
  ): Promise<string>;

  generateStream(
    prompt: string,
    options?: GenerationOptions,
  ): AsyncIterable<string>;
}
