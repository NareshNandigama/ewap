import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { MessagingService } from '../messaging/messaging.service.js';
import { RedisService } from '../redis/redis.service.js';

const WORKFLOW_RUN_LIST_TTL_SECONDS = 60;

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

  private buildWorkflowListKey(
    organizationId: string,
    workflowId: string,
  ) {
    return `org:${organizationId}:workflows:${workflowId}:workflow-runs:list`;
  }

  private buildRunKey(organizationId: string, runId: string) {
    return `org:${organizationId}:workflow-runs:run:${runId}`;
  }

  private async getCached<T>(key: string): Promise<T | null> {
    if (!this.redisService.isAvailable()) {
      return null;
    }

    return this.redisService.get<T>(key);
  }

  private async setCached<T>(
    key: string,
    value: T,
    ttlSeconds = WORKFLOW_RUN_LIST_TTL_SECONDS,
  ): Promise<void> {
    if (!this.redisService.isAvailable()) {
      return;
    }

    await this.redisService.set(key, value, ttlSeconds);
  }

  async invalidateOrganizationCaches(organizationId: string): Promise<void> {
    if (!this.redisService.isAvailable()) {
      return;
    }

    await Promise.all([
      this.redisService.flushPattern(
        `org:${organizationId}:workflow-runs:*`,
      ),
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
  ) {
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        project: {
        organizationId,
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException(
        `Workflow with id ${workflowId} not found`,
      );
    }

    const run = await this.prisma.workflowRun.create({
      data: {
        workflowId,
        status: 'PENDING',
      },
    });

    await this.invalidateOrganizationCaches(organizationId);

    await this.messagingService.publishWorkflowRun(
      run.id,
      workflowId,
    );

    return run;
  }

  async findAll(organizationId: string) {
    const cacheKey = this.buildOrganizationListKey(organizationId);
    const cached = await this.getCached(cacheKey);

    if (cached) {
      return cached;
    }

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

    await this.setCached(cacheKey, result);
    return result;
  }

  async findByWorkflow(
    workflowId: string,
    organizationId: string,
  ) {
    const cacheKey = this.buildWorkflowListKey(
      organizationId,
      workflowId,
    );
    const cached = await this.getCached(cacheKey);

    if (cached) {
      return cached;
    }

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

    await this.setCached(cacheKey, result);
    return result;
  }

  async findOne(
    id: string,
    organizationId: string,
  ) {
    const cacheKey = this.buildRunKey(organizationId, id);
    const cached = await this.getCached(cacheKey);

    if (cached) {
      return cached;
    }

    const workflowRun =
      await this.prisma.workflowRun.findFirst({
        where: {
          id,
          workflow: {
            project: {
              organizationId,
            },
          },
        },
        include: {
          logs: {
            orderBy: {
              createdAt: 'asc',
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
      throw new NotFoundException(
        `WorkflowRun with id ${id} not found`,
      );
    }

    await this.setCached(cacheKey, workflowRun);
    return workflowRun;
  }
}