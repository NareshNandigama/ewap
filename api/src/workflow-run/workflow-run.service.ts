import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { MessagingService } from '../messaging/messaging.service.js';

@Injectable()
export class WorkflowRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingService: MessagingService,
  ) {}

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

    await this.messagingService.publishWorkflowRun(
      run.id,
      workflowId,
    );

    return run;
  }

  async findAll(organizationId: string) {
    return this.prisma.workflowRun.findMany({
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
  }

  async findByWorkflow(
    workflowId: string,
    organizationId: string,
  ) {
    return this.prisma.workflowRun.findMany({
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
  }

  async findOne(
    id: string,
    organizationId: string,
  ) {
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

    return workflowRun;
  }
}