import { ConfigModule } from '@nestjs/config';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { EmbeddingClient } from './embedding.client.js';
import { RunbookRetrievalService } from './runbook-retrieval.service.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RunbookController } from './runbook.controller.js';
import { RunbookService } from './runbook.service.js';

@Module({
  imports: [AuthModule, PrismaModule, ConfigModule, RateLimitModule],
  controllers: [RunbookController],
  providers: [RunbookService, EmbeddingClient, RunbookRetrievalService],
})
export class RunbookModule {}
