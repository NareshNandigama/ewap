import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';

@Injectable()
export class ProjectService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    createProjectDto: CreateProjectDto,
  ) {
    // 1. Make sure the organization exists
    const organization = await this.prisma.organization.findUnique({
      where: {
        id: organizationId,
      },
    });

    if (!organization) {
      throw new NotFoundException(
        `Organization with id ${organizationId} not found`,
      );
    }

    // 2. Create the project under that organization
    return this.prisma.project.create({
      data: {
        name: createProjectDto.name,
        description: createProjectDto.description,
        organizationId,
      },
    });
  }

  async findByOrganization(organizationId: string) {
    return this.prisma.project.findMany({
      where: {
        organizationId,
      },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: {
        id,
      },
    });

    if (!project) {
      throw new NotFoundException(
        `Project with id ${id} not found`,
      );
    }

    return project;
  }
}