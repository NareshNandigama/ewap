import { RunbookModule } from '../runbook/runbook.module.js';
import { GroundedDiagnosticsService } from './grounded-diagnostics.service.js';
import { GeminiGroundedDiagnosticsService } from './gemini-grounded-diagnostics.service.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiAgentService } from './ai-agent.service.js';
import { AiConversationService } from './ai-conversation.service.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { ClaudeProvider } from './providers/claude.provider.js';
import { WorkflowRunTool } from './tools/workflow-run.tool.js';
import { PythonDiagnosticsClient } from './python-diagnostics.client.js';
import { WorkflowDiagnosticsService } from './workflow-diagnostics.service.js';

import { WorkflowRunModule } from '../workflow-run/workflow-run.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    RateLimitModule,
    RunbookModule,
    ConfigModule,
    WorkflowRunModule,
    PrismaModule,
    AuthModule,
  ],
  controllers: [AiController],
  providers: [
    GroundedDiagnosticsService,
    GeminiGroundedDiagnosticsService,
    AiService,
    AiAgentService,
    PythonDiagnosticsClient,
    WorkflowDiagnosticsService,
    AiConversationService,
    WorkflowRunTool,
    {
      provide: 'LLM_PROVIDER',
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('AI_PROVIDER') === 'claude'
          ? new ClaudeProvider(config)
          : new GeminiProvider(config),
    },
  ],
  exports: ['LLM_PROVIDER'],
})
export class AiModule {}
