import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller.js';
import { WorkflowService } from './workflow.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [WorkflowController],
  providers: [WorkflowService]
})
export class WorkflowModule {}
