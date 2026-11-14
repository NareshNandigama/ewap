import { PrismaModule } from '../prisma/prisma.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { MessagingModule } from '../messaging/messaging.module.js';
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [PrismaModule, WorkflowModule, MessagingModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
