import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AiModule } from '../ai/ai.module.js';
import { IntegrationEventsController } from './integration-events.controller.js';
import { IntegrationEventsService } from './integration-events.service.js';
import { IntegrationDiagnosticAgentService } from './integration-diagnostic-agent.service.js';

@Module({
  imports: [PrismaModule, AuthModule, AiModule],
  controllers: [IntegrationEventsController],
  providers: [IntegrationEventsService, IntegrationDiagnosticAgentService],
})
export class IntegrationEventsModule {}
