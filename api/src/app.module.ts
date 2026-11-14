import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthModule } from './health/health.module.js';
import { ConfigModule } from '@nestjs/config';
import { ProjectModule } from './project/project.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { OrganizationModule } from './organization/organization.module.js';
import { UserModule } from './user/user.module.js';
import { WorkflowModule } from './workflow/workflow.module.js';
import { WorkflowRunModule } from './workflow-run/workflow-run.module.js';
import { MessagingModule } from './messaging/messaging.module.js';
import { AiModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { IntegrationEventsModule } from './integration-events/integration-events.module.js';
import { RedisModule } from './redis/redis.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { environmentSchema } from './config/environment.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validationSchema: environmentSchema,
    }),
    HealthModule,
    AnalyticsModule,
    ProjectModule,
    PrismaModule,
    OrganizationModule,
    UserModule,
    WorkflowModule,
    WorkflowRunModule,
    MessagingModule,
    RedisModule,
    AiModule,
    AuthModule,
    IntegrationEventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
