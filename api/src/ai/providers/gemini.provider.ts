import { Injectable } from '@nestjs/common';

import { GoogleGenAI } from '@google/genai';
import type { LlmProvider } from './llm-provider.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GeminiProvider implements LlmProvider {
  private readonly ai: GoogleGenAI;

  constructor(configService: ConfigService) {
    this.ai = new GoogleGenAI({
      apiKey: configService.getOrThrow<string>('GEMINI_API_KEY'),
    });
  }

  async generate(prompt: string): Promise<string> {
    const interaction = await this.ai.interactions.create({
      model: 'gemini-3.6-flash',
      input: prompt,
    });

    return interaction.output_text ?? '';
  }
}