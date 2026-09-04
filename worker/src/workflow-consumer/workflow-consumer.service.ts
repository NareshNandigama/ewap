import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WorkflowConsumerService {
  constructor(private readonly prisma: PrismaService) {}

  async executeWorkflow(runId: string): Promise<void> {
    // Step 1: Mark the workflow run as RUNNING
    await this.prisma.workflowRun.update({
      where: {
        id: runId,
      },
      data: {
        status: 'RUNNING',
      },
    });

    console.log(`🚀 WorkflowRun ${runId} is now RUNNING`);

    try {
      // Step 2: Execute the workflow
      console.log(`⚙️ Executing workflow for Run ${runId}...`);

      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });

      // Temporary failure simulation
      // throw new Error('Simulated workflow execution failure');

      // Step 3: Mark the workflow run as SUCCESS
      await this.prisma.workflowRun.update({
        where: {
          id: runId,
        },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
        },
      });

      console.log(`✅ WorkflowRun ${runId} completed SUCCESSFULLY`);
    } catch (error) {
      // Step 4: Mark the workflow run as FAILED
      await this.prisma.workflowRun.update({
        where: {
          id: runId,
        },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
        },
      });

      console.error(`❌ WorkflowRun ${runId} FAILED`);

      // Re-throw the error.
      // We will use this later when we implement
      // RabbitMQ retry / ACK / DLQ behavior.
      throw error;
    }
  }
}