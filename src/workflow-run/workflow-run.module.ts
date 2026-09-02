import { Module } from '@nestjs/common';
import { WorkflowRunController } from './workflow-run.controller.js';
import { WorkflowRunService } from './workflow-run.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MessagingModule } from '../messaging/messaging.module.js';


@Module({
  imports: [PrismaModule, MessagingModule],
  controllers: [WorkflowRunController],
  providers: [WorkflowRunService]
})
export class WorkflowRunModule {}
