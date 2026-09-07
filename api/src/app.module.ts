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
import Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production').default('development'),
        PORT: Joi.number().default(3000),
        APP_NAME: Joi.string().required(),
        APP_VERSION: Joi.string().required(),
        DATABASE_URL: Joi.string().required(),
        RABBITMQ_URL: Joi.string().required(),
        GEMINI_API_KEY: Joi.string().required(),
      }),
    }),
    HealthModule,
    ProjectModule,
    PrismaModule,
    OrganizationModule,
    UserModule,
    WorkflowModule,
    WorkflowRunModule,
    MessagingModule,
    AiModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
