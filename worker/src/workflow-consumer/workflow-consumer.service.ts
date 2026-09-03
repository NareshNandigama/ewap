import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WorkflowConsumerService {
  constructor(private readonly prisma: PrismaService) {}

  async markRunAsRunning(runId: string): Promise<void> {
    await this.prisma.workflowRun.update({
      where: {
        id: runId,
      },
      data: {
        status: 'RUNNING',
      },
    });

    console.log(`🚀 WorkflowRun ${runId} is now RUNNING`);
  }
}