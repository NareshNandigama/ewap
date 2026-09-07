import { Module } from '@nestjs/common';

import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
// import { OpenAiProvider } from './providers/openai.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { WorkflowRunTool } from './tools/workflow-run.tool.js';
import { WorkflowRunModule } from '../workflow-run/workflow-run.module.js';
@Module({
  imports: [WorkflowRunModule],
  controllers: [AiController],
  providers: [
    AiService,
    WorkflowRunTool,
    {
      provide: 'LLM_PROVIDER',
      useClass: GeminiProvider,
    }
  ],
})
export class AiModule {}