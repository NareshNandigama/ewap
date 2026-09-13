import OpenAI from 'openai';

import { LlmProvider } from './llm-provider.js';

export class OpenAiProvider implements LlmProvider {
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.openai.responses.create({
      model: 'gpt-5.5',
      input: prompt,
    });

    return response.output_text;
  }
  async *generateStream(prompt: string): AsyncIterable<string> {
    const stream = await this.openai.responses.create({
      model: 'gpt-5.5',
      input: prompt,
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        yield event.delta;
      }
    }
  } 
}                                                         