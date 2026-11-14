import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { MessagingService } from '../messaging/messaging.service.js';
import { createHash } from 'node:crypto';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class WorkflowRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingService: MessagingService,
    private readonly redisService: RedisService,
  ) {}

  private buildOrganizationListKey(organizationId: string) {
    return `org:${organizationId}:workflow-runs:list`;
  }

  private buildWorkflowListKey(organizationId: string, workflowId: string) {
    return `org:${organizationId}:workflows:${workflowId}:workflow-runs:list`;
  }

  private buildRunKey(organizationId: string, runId: string) {
    return `org:${organizationId}:workflow-runs:run:${runId}`;
  }

  async invalidateOrganizationCaches(organizationId: string): Promise<void> {
    if (!this.redisService.isAvailable()) {
      return;
    }

    await Promise.all([
      this.redisService.flushPattern(`org:${organizationId}:workflow-runs:*`),
      this.redisService.flushPattern(
        `org:${organizationId}:workflows:*:workflow-runs:*`,
      ),
    ]);
  }

  async invalidateRunCaches(runId: string): Promise<void> {
    const workflowRun = await this.prisma.workflowRun.findUnique({
      where: { id: runId },
      select: {
        workflow: {
          select: {
            project: {
              select: { organizationId: true },
            },
          },
        },
      },
    });

    if (!workflowRun?.workflow?.project?.organizationId) {
      return;
    }

    const organizationId = workflowRun.workflow.project.organizationId;
    await Promise.all([
      this.redisService.del(this.buildRunKey(organizationId, runId)),
      this.invalidateOrganizationCaches(organizationId),
    ]);
  }

  async create(
    workflowId: string,
    organizationId: string,
    requestKey?: string,
  ) {
    if (
      requestKey !== undefined &&
      !/^[A-Za-z0-9._:-]{1,128}$/.test(requestKey)
    )
      throw new BadRequestException('Invalid Idempotency-Key');
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        project: {
          organizationId,
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow with id ${workflowId} not found`);
    }

    const idempotencyKey =
      requestKey === undefined
        ? undefined
        : createHash('sha256')
            .update(JSON.stringify([organizationId, workflowId, requestKey]))
            .digest('hex');
    const create = () =>
      this.prisma.$transaction(async (tx) => {
        if (idempotencyKey) {
          const previous = await tx.workflowRun.findUnique({
            where: { idempotencyKey },
          });
          if (previous) return previous;
        }
        const run = await tx.workflowRun.create({
          data: {
            workflowId,
            status: 'PENDING',
            idempotencyKey,
            dispatchEnabled: this.messagingService.isEnabled(),
          },
        });
        if (run.dispatchEnabled)
          await tx.workflowOutbox.create({
            data: {
              key: `dispatch:${run.id}`,
              kind: 'EXECUTE',
              runId: run.id,
              workflowId,
            },
          });
        return run;
      });
    let run;
    try {
      run = await create();
    } catch (error) {
      if (!idempotencyKey || (error as { code?: string }).code !== 'P2002')
        throw error;
      run = await this.prisma.workflowRun.findUnique({
        where: { idempotencyKey },
      });
      if (!run) throw error;
    }
    // A cache outage must not change the outcome of an already committed command.
    await this.invalidateOrganizationCaches(organizationId).catch(
      () => undefined,
    );

    return run;
  }

  async findAll(organizationId: string) {
    const result = await this.prisma.workflowRun.findMany({
      where: {
        workflow: {
          project: {
            organizationId,
          },
        },
      },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return result;
  }

  async findByWorkflow(workflowId: string, organizationId: string) {
    const result = await this.prisma.workflowRun.findMany({
      where: {
        workflowId,
        workflow: {
          project: {
            organizationId,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return result;
  }

  async findOne(id: string, organizationId: string) {
    const workflowRun = await this.prisma.workflowRun.findFirst({
      where: {
        id,
        workflow: {
          project: {
            organizationId,
          },
        },
      },
      include: {
        _count: { select: { logs: true } },
        logs: {
          take: 200,
          orderBy: {
            createdAt: 'desc',
          },
        },
        workflow: {
          select: {
            id: true,
            name: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!workflowRun) {
      throw new NotFoundException(`WorkflowRun with id ${id} not found`);
    }

    workflowRun.logs.reverse();
    const dispatch = workflowRun.dispatchEnabled
      ? await this.prisma.workflowOutbox.findUnique({
          where: { key: `dispatch:${workflowRun.id}` },
          select: { createdAt: true, deliveredAt: true, availableAt: true },
        })
      : null;
    return {
      ...workflowRun,
      logsTruncated: workflowRun._count.logs > workflowRun.logs.length,
      dispatch: {
        state: !workflowRun.dispatchEnabled
          ? 'DISABLED'
          : dispatch?.deliveredAt
            ? 'DISPATCHED'
            : 'QUEUED',
        ...dispatch,
      },
    };
  }
}
