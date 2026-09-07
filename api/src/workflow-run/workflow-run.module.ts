import { Module } from '@nestjs/common';
import { WorkflowRunController } from './workflow-run.controller.js';
import { WorkflowRunService } from './workflow-run.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MessagingModule } from '../messaging/messaging.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';

@Module({
  imports: [PrismaModule, MessagingModule,WorkflowModule],
  controllers: [WorkflowRunController],
  providers: [WorkflowRunService],
  exports: [WorkflowRunService],
})
export class WorkflowRunModule {}
