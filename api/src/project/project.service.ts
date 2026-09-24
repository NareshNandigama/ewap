import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    requestedOrganizationId: string,
    authenticatedOrganizationId: string,
    createProjectDto: CreateProjectDto,
  ) {
    this.validateOrganizationAccess(
      requestedOrganizationId,
      authenticatedOrganizationId,
    );

    const organization =
      await this.prisma.organization.findUnique({
        where: {
          id: authenticatedOrganizationId,
        },
      });

    if (!organization) {
      throw new NotFoundException(
        `Organization with id ${authenticatedOrganizationId} not found`,
      );
    }

    return this.prisma.project.create({
      data: {
        name: createProjectDto.name,
        description: createProjectDto.description,
        organizationId:
          authenticatedOrganizationId,
      },
    });
  }

  async findByOrganization(
    requestedOrganizationId: string,
    authenticatedOrganizationId: string,
  ) {
    this.validateOrganizationAccess(
      requestedOrganizationId,
      authenticatedOrganizationId,
    );

    return this.prisma.project.findMany({
      where: {
        organizationId:
          authenticatedOrganizationId,
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
    const project =
      await this.prisma.project.findFirst({
        where: {
          id,
          organizationId,
        },
      });

    if (!project) {
      throw new NotFoundException(
        `Project with id ${id} not found`,
      );
    }

    return project;
  }

  private validateOrganizationAccess(
    requestedOrganizationId: string,
    authenticatedOrganizationId: string,
  ) {
    if (
      requestedOrganizationId !==
      authenticatedOrganizationId
    ) {
      throw new ForbiddenException(
        'You do not have access to this organization',
      );
    }
  }
}