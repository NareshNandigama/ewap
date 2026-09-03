import { Module } from '@nestjs/common';
import { WorkflowConsumerController } from './workflow-consumer.controller.js';
import { WorkflowConsumerService } from './workflow-consumer.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [WorkflowConsumerController],
  providers: [WorkflowConsumerService]
})
export class WorkflowConsumerModule {}
