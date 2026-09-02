import { Module } from '@nestjs/common';
import { WorkflowRunController } from './workflow-run.controller.js';
import { WorkflowRunService } from './workflow-run.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';


@Module({
  imports: [PrismaModule],
  controllers: [WorkflowRunController],
  providers: [WorkflowRunService]
})
export class WorkflowRunModule {}
