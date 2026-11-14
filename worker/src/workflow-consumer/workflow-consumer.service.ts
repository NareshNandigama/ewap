import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from '../prisma/prisma.service.js';

export class ExecutionLeaseLost extends Error {}
export class WorkflowExecutionFailed extends Error {}

@Injectable()
export class WorkflowConsumerService {
  constructor(private readonly prisma: PrismaService) {}

  async executeWorkflow(runId: string, retryCount: number): Promise<boolean> {
    const token = randomUUID();
    const claimed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.workflowRun.updateMany({
        where: {
          id: runId,
          OR: [
            { status: 'PENDING', executionRetry: retryCount },
            { status: 'FAILED', executionRetry: retryCount - 1 },
            {
              status: 'RUNNING',
              executionRetry: retryCount,
              leaseExpiresAt: { lt: new Date() },
            },
          ],
        },
        data: {
          status: 'RUNNING',
          executionToken: token,
          executionRetry: retryCount,
          leaseExpiresAt: new Date(Date.now() + 30000),
          completedAt: null,
          statusVersion: { increment: 1 },
        },
      });
      if (!result.count) return false;
      const run = await tx.workflowRun.findUniqueOrThrow({
        where: { id: runId },
      });
      await tx.workflowExecutionLog.create({
        data: {
          workflowRunId: runId,
          level: 'INFO',
          message: 'Workflow execution started',
          metadata: { executionToken: token, retryCount },
        },
      });
      await tx.workflowOutbox.create({
        data: {
          key: `status:${token}:RUNNING`,
          kind: 'STATUS',
          runId,
          workflowId: run.workflowId,
          status: 'RUNNING',
        },
      });
      return true;
    });
    if (!claimed) {
      const current = await this.prisma.workflowRun.findUnique({
        where: { id: runId },
      });
      if (current?.status === 'FAILED' && current.executionRetry === retryCount)
        throw new WorkflowExecutionFailed(
          'Recovering persisted failed execution',
        );
      return false;
    }
    const abort = new AbortController();
    let heartbeat: Promise<void> | undefined;
    const timer = setInterval(() => {
      if (heartbeat) return;
      heartbeat = this.prisma.workflowRun
        .updateMany({
          where: {
            id: runId,
            executionToken: token,
            status: 'RUNNING',
            leaseExpiresAt: { gt: new Date() },
          },
          data: { leaseExpiresAt: new Date(Date.now() + 30000) },
        })
        .then((result) => {
          if (!result.count) abort.abort();
        })
        .catch(() => {
          abort.abort();
        })
        .finally(() => {
          heartbeat = undefined;
        });
    }, 5000);
    timer.unref();
    try {
      // Current executor has no external side effects. Future steps must use stable
      // per-step idempotency keys and honour this signal before lease recovery is safe.
      await this.executeSteps(runId, abort.signal);
      if (abort.signal.aborted) throw new ExecutionLeaseLost();
      await this.finish(runId, token, 'SUCCESS');
      return true;
    } catch (error) {
      if (!(error instanceof ExecutionLeaseLost) && !abort.signal.aborted) {
        await this.finish(runId, token, 'FAILED');
        throw new WorkflowExecutionFailed('Workflow execution failed', {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearInterval(timer);
      await heartbeat;
    }
  }

  protected async executeSteps(_runId: string, signal: AbortSignal) {
    await delay(2000, undefined, { signal });
  }

  private async finish(
    runId: string,
    token: string,
    status: 'SUCCESS' | 'FAILED',
  ) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workflowRun.updateMany({
        where: {
          id: runId,
          executionToken: token,
          status: 'RUNNING',
          leaseExpiresAt: { gt: new Date() },
        },
        data: {
          status,
          completedAt: new Date(),
          leaseExpiresAt: null,
          statusVersion: { increment: 1 },
        },
      });
      if (!updated.count) throw new ExecutionLeaseLost('Execution lease lost');
      const run = await tx.workflowRun.findUniqueOrThrow({
        where: { id: runId },
      });
      await tx.workflowOutbox.create({
        data: {
          key: `status:${token}:${status}`,
          kind: 'STATUS',
          runId,
          workflowId: run.workflowId,
          status,
        },
      });
    });
  }
}
