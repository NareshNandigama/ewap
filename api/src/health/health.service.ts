import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowFanoutService } from '../workflow/workflow-fanout.service.js';
import { MessagingService } from '../messaging/messaging.service.js';
@Injectable()
export class HealthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly fanout: WorkflowFanoutService,
    private readonly messaging: MessagingService,
  ) {}
  getHealth() {
    return {
      status: 'ok',
      service: this.configService.get<string>('APP_NAME'),
      version: this.configService.get<string>('APP_VERSION'),
    };
  }
  async readiness() {
    try {
      await this.prisma
        .$queryRaw`SELECT "executionToken", "statusVersion" FROM "WorkflowRun" LIMIT 0`;
      await this.prisma
        .$queryRaw`SELECT "deliveredAt" FROM "WorkflowOutbox" LIMIT 0`;
      await this.prisma.$queryRaw`SELECT "state" FROM "AiMessage" LIMIT 0`;
      if (!this.fanout.isReady() || !(await this.messaging.isReady()))
        throw new Error('Dependency unavailable');
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Dependencies are not ready');
    }
  }
}
