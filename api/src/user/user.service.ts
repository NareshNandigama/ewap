import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    createUserDto: CreateUserDto,
  ) {
    const organization =
      await this.prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
      });

    if (!organization) {
      throw new NotFoundException(
        `Organization with id ${organizationId} not found`,
      );
    }

    const passwordHash = await bcrypt.hash(
      createUserDto.password,
      12,
    );

    return this.prisma.$transaction(async (tx) => {
      const userCount = await tx.user.count({
        where: {
          organizationId,
        },
      });

      const role = userCount === 0 ? 'ADMIN' : 'MEMBER';

      return tx.user.create({
        data: {
          name: createUserDto.name,
          email: createUserDto.email,
          passwordHash,
          organizationId,
          role,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          organizationId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  }

  findByOrganization(organizationId: string) {
    return this.prisma.user.findMany({
      where: {
        organizationId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        `User with id ${id} not found`,
      );
    }

    return user;
  }
}