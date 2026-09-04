import { Module } from '@nestjs/common';
import { WorkflowConsumerController } from './workflow-consumer.controller.js';
import { WorkflowConsumerService } from './workflow-consumer.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RabbitMqTopologyService } from '../messaging/rabbitmq-topology.service.js';
import { RabbitMqPublisherService } from '../messaging/rabbitmq-publisher.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [WorkflowConsumerController],
  providers: [WorkflowConsumerService, 
    RabbitMqTopologyService,
  RabbitMqPublisherService
]
})
export class WorkflowConsumerModule {}
