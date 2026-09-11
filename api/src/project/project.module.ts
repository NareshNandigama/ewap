import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProjectService } from './project.service.js';
import { ProjectController } from './project.controller.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  providers: [ProjectService],
  controllers: [ProjectController],
})
export class ProjectModule {}