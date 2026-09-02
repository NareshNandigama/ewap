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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HealthModule,
    ProjectModule,
    PrismaModule,
    OrganizationModule,
    UserModule,
    WorkflowModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
