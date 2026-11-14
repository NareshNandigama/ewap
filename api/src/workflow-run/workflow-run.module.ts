import { DispatchOutboxService } from './dispatch-outbox.service.js';
import { Module } from '@nestjs/common';

import { WorkflowRunController } from './workflow-run.controller.js';
import { WorkflowRunService } from './workflow-run.service.js';

import { PrismaModule } from '../prisma/prisma.module.js';
import { MessagingModule } from '../messaging/messaging.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { ConfigModule } from '@nestjs/config';
import { WorkflowStatusController } from './workflow-status.controller.js';
import { WorkflowStatusService } from './workflow-status.service.js';
import { WorkerStatusGuard } from './worker-status.guard.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    MessagingModule,
    WorkflowModule,
    AuthModule,
    RedisModule,
  ],

  controllers: [WorkflowRunController, WorkflowStatusController],

  providers: [
    DispatchOutboxService,
    WorkflowRunService,
    WorkflowStatusService,
    WorkerStatusGuard,
  ],

  exports: [WorkflowRunService],
})
export class WorkflowRunModule {}
