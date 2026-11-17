import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RunbookController } from './runbook.controller.js';
import { RunbookService } from './runbook.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [RunbookController],
  providers: [RunbookService],
})
export class RunbookModule {}
