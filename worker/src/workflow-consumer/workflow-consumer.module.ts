import { StatusOutboxService } from './status-outbox.service.js';
import { Module } from '@nestjs/common';
import { WorkflowConsumerController } from './workflow-consumer.controller.js';
import { WorkflowConsumerService } from './workflow-consumer.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RabbitMqPublisherService } from '../messaging/rabbitmq-publisher.service.js';
import { ConfigModule } from '@nestjs/config';
import { WorkerStatusClient } from './worker-status.client.js';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [WorkflowConsumerController],
  providers: [
    WorkflowConsumerService,
    StatusOutboxService,
    WorkerStatusClient,
    RabbitMqPublisherService,
  ],
})
export class WorkflowConsumerModule {}
