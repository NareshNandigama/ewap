import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WorkflowRunService {
  constructor(private readonly prisma: PrismaService) {}

  async create(workflowId: string) {
    // 1. Make sure the workflow exists
    const workflow = await this.prisma.workflow.findUnique({
      where: {
        id: workflowId,
      },
    });

    if (!workflow) {
      throw new NotFoundException(
        `Workflow with id ${workflowId} not found`,
      );
    }

    // 2. Create a new execution with server-controlled state
    return this.prisma.workflowRun.create({
      data: {
        workflowId,
        status: 'PENDING',
      },
    });
  }

  async findByWorkflow(workflowId: string) {
    return this.prisma.workflowRun.findMany({
      where: {
        workflowId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const workflowRun = await this.prisma.workflowRun.findUnique({
      where: {
        id,
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