import 'dotenv/config';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WorkflowConsumerService {
constructor(
  private readonly prisma: PrismaService,
  private readonly configService: ConfigService,
) {}
  async executeWorkflow(runId: string,  retryCount: number): Promise<boolean> {
    // Step 1: Mark the workflow run as RUNNING
    const result = await this.prisma.workflowRun.updateMany({
    where: {
        id: runId,
        status: retryCount === 0 ? 'PENDING' : 'FAILED', // Only allow transition to RUNNING if the current status is PENDING or FAILED
        },
        data: {
            status: 'RUNNING',
        },
    });
    if (result.count === 0) {
        console.log(
        `⏭️ WorkflowRun ${runId} is already being processed or completed. Skipping.`,
        );

        return false;
    }

    console.log(`🚀 WorkflowRun ${runId} is now RUNNING`);
    
    await this.prisma.workflowExecutionLog.create({
      data: {
        workflowRunId: runId,
        level: 'INFO',
        message: 'Workflow execution started',
      },
    });

    await this.notifyStatus(runId, 'RUNNING');
    try {
      // Step 2: Execute the workflow
      console.log(`⚙️ Executing workflow for Run ${runId}...`);

      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });

      // Temporary failure simulation
      //throw new Error('Simulated workflow execution failure');

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
      await this.notifyStatus(runId, 'SUCCESS');
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
      await this.notifyStatus(runId, 'FAILED');
      // Re-throw the error.
      // We will use this later when we implement
      // RabbitMQ retry / ACK / DLQ behavior.
      throw error;
    }
    return true;
  }

  private async notifyStatus(
    runId: string,
    status: string,
  ): Promise<void> {
    const apiBaseUrl =
      this.configService.getOrThrow<string>('API_BASE_URL');

    await fetch(
      `${apiBaseUrl}/api/v1/workflow-runs/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          runId,
          status,
        }),
      },
    );
  }
}