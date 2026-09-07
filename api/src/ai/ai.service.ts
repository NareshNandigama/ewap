import { Inject, Injectable } from '@nestjs/common';

import type { LlmProvider } from './providers/llm-provider.js';

@Injectable()
export class AiService {
  constructor(
    @Inject('LLM_PROVIDER')
    private readonly llmProvider: LlmProvider,
  ) {}

  async ask(question: string): Promise<{ answer: string }> {
    const answer = await this.llmProvider.generate(question);

    return {
      answer,
    };
  }
}