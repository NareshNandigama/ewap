export interface LlmProvider {
  generate(prompt: string): Promise<string>;

  generateStream(prompt: string): AsyncIterable<string>;
}