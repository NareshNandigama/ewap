import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateWorkflowDto } from './dto/create-workflow.dto.js';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    projectId: string,
    createWorkflowDto: CreateWorkflowDto,
  ) {
    // 1. Make sure the parent Project exists
    const project = await this.prisma.project.findUnique({
      where: {
        id: projectId,
      },
    });

    if (!project) {
      throw new NotFoundException(
        `Project with id ${projectId} not found`,
      );
    }

    // 2. Create the Workflow under that Project
    return this.prisma.workflow.create({
      data: {
        name: createWorkflowDto.name,
        projectId,
      },
    });
  }

  async findByProject(projectId: string) {
    return this.prisma.workflow.findMany({
      where: {
        projectId,
      },
    });
  }

  async findOne(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: {
        id,
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