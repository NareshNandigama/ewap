import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/index.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';
import { hashAccountPassword } from '../auth/password.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { publicUserSelect } from './public-user.js';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  private scope(organizationId: string, actor: JwtPayload) {
    if (
      !actor ||
      typeof actor.sub !== 'string' ||
      !actor.sub.trim() ||
      typeof actor.organizationId !== 'string' ||
      !actor.organizationId.trim() ||
      !['ADMIN', 'MEMBER'].includes(actor.role) ||
      organizationId !== actor.organizationId
    ) {
      throw new ForbiddenException('Organization access denied');
    }
  }

  private async requireAdmin(
    organizationId: string,
    actor: JwtPayload,
    db: Pick<PrismaService, 'user'> = this.prisma,
  ) {
    this.scope(organizationId, actor);
    if (actor.role !== 'ADMIN')
      throw new ForbiddenException('Administrator access required');
    // Revalidate privileged operations against current membership, not only a
    // potentially stale role claim in an otherwise valid JWT.
    const administrator = await db.user.findFirst({
      where: { id: actor.sub, organizationId, role: 'ADMIN' },
      select: { id: true },
    });
    if (!administrator)
      throw new ForbiddenException('Administrator access required');
  }

  async create(
    organizationId: string,
    input: CreateUserDto,
    actor: JwtPayload,
  ) {
    this.scope(organizationId, actor);
    if (actor.role !== 'ADMIN')
      throw new ForbiddenException('Administrator access required');
    await this.requireAdmin(organizationId, actor);
    const passwordHash = await hashAccountPassword(input.password);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.requireAdmin(organizationId, actor, tx);
          return tx.user.create({
            data: {
              name: input.name,
              email: input.email,
              passwordHash,
              organizationId,
              role: 'MEMBER',
            },
            select: publicUserSelect,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  async findByOrganization(organizationId: string, actor: JwtPayload) {
    await this.requireAdmin(organizationId, actor);
    return this.prisma.user.findMany({
      where: { organizationId },
      select: publicUserSelect,
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: string, actor: JwtPayload) {
    this.scope(actor?.organizationId, actor);
    if (actor.role === 'ADMIN')
      await this.requireAdmin(actor.organizationId, actor);
    else if (id !== actor.sub) throw new NotFoundException('User not found');
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: publicUserSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
