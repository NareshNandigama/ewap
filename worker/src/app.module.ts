import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { WorkflowConsumerModule } from './workflow-consumer/workflow-consumer.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: [WorkflowConsumerModule, PrismaModule],
})
export class AppModule {}
