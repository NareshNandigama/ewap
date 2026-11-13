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
import Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production').default('development'),
        PORT: Joi.number().default(3000),
        APP_NAME: Joi.string().default('EWAP API'),
        APP_VERSION: Joi.string().default('1.0.0'),
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().optional(),
        AI_DIAGNOSTICS_URL: Joi.string().uri({ scheme: ['http', 'https'] }).optional(),
        AI_SERVICE_API_KEY: Joi.string().pattern(/^[\x21-\x7e]{32,512}$/).optional(),
        AI_DIAGNOSTICS_TIMEOUT_MS: Joi.number().integer().min(100).max(30000).default(3000),
        RABBITMQ_URL: Joi.string().optional(),
        GEMINI_API_KEY: Joi.string().required(),
        FRONTEND_URL: Joi.string().optional(),
        ENABLE_MESSAGING: Joi.boolean().default(true),
      }),
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
