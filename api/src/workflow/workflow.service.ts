import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateWorkflowDto } from './dto/create-workflow.dto.js';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    projectId: string,
    createWorkflowDto: CreateWorkflowDto,
    organizationId: string,
  ) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId,
      },
    });

    if (!project) {
      throw new NotFoundException(
        `Project with id ${projectId} not found`,
      );
    }

    return this.prisma.workflow.create({
      data: {
        name: createWorkflowDto.name,
        projectId,
      },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.workflow.findMany({
      where: {
        project: {
          organizationId,
        },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        runs: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByProject(
    projectId: string,
    organizationId: string,
  ) {
    return this.prisma.workflow.findMany({
      where: {
        projectId,
        project: {
          organizationId,
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
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id,
        project: {
          organizationId,
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException(
        `Workflow with id ${id} not found`,
      );
    }

    return workflow;
  }
}