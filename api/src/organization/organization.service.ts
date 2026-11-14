import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  private requireScope(organizationId: string) {
    if (typeof organizationId !== 'string' || !organizationId.trim()) {
      throw new ForbiddenException('Organization context required');
    }
  }

  findAll(organizationId: string) {
    this.requireScope(organizationId);
    return this.prisma.organization.findMany({ where: { id: organizationId } });
  }

  async findOne(id: string, organizationId: string) {
    this.requireScope(organizationId);
    if (id !== organizationId)
      throw new NotFoundException('Organization not found');
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    return organization;
  }
}
