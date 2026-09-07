import { Module } from '@nestjs/common';

import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
// import { OpenAiProvider } from './providers/openai.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    {
      provide: 'LLM_PROVIDER',
      useClass: GeminiProvider,
    },
  ],
})
export class AiModule {}