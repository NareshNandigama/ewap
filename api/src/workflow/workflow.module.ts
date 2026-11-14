import { WorkflowFanoutService } from './workflow-fanout.service.js';
import { Module } from '@nestjs/common';

import { WorkflowController } from './workflow.controller.js';
import { WorkflowService } from './workflow.service.js';
import { WorkflowGateway } from './workflow.gateway.js';

import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [PrismaModule, AuthModule],

  controllers: [WorkflowController],

  providers: [WorkflowService, WorkflowGateway, WorkflowFanoutService],

  exports: [WorkflowGateway, WorkflowFanoutService],
})
export class WorkflowModule {}
