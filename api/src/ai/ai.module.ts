
import { Module } from '@nestjs/common';

import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiAgentService } from './ai-agent.service.js';
import { AiConversationService } from './ai-conversation.service.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { WorkflowRunTool } from './tools/workflow-run.tool.js';

import { WorkflowRunModule } from '../workflow-run/workflow-run.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    WorkflowRunModule,
    PrismaModule,
    AuthModule,
  ],
  controllers: [AiController],
  providers: [
    AiService,
    AiAgentService,
    AiConversationService,
    WorkflowRunTool,
    {
      provide: 'LLM_PROVIDER',
      useClass: GeminiProvider,
    },
  ],
  exports: ['LLM_PROVIDER'],
})
export class AiModule {}
