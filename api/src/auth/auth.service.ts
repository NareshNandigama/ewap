import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/index.js';
import { RegisterDto } from './dto/register.dto.js';
import { hashAccountPassword } from './password.js';
import { publicUserSelect } from '../user/public-user.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(input: RegisterDto) {
    const passwordHash = await hashAccountPassword(input.password);
    let organization;
    try {
      // Prisma nested writes are atomic: a failed user insert cannot leave an
      // orphan organization. No count-then-promote race or existing tenant ID.
      organization = await this.prisma.organization.create({
        data: {
          name: input.organizationName,
          users: {
            create: {
              name: input.name,
              email: input.email,
              passwordHash,
              role: 'ADMIN',
            },
          },
        },
        select: { id: true, name: true, users: { select: publicUserSelect } },
      });
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
    const user = organization.users[0];
    return {
      ...(await this.createAccessToken(user)),
      organization: { id: organization.id, name: organization.name },
      user,
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createAccessToken(user);
  }

  async demoLogin() {
    const demoEmail = this.configService.get<string>('DEMO_USER_EMAIL');

    if (!demoEmail) {
      throw new NotFoundException('Demo access is not configured');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        email: demoEmail,
      },
    });

    if (!user) {
      throw new NotFoundException('Demo user is not configured');
    }

    if (user.role !== 'MEMBER') {
      throw new NotFoundException('Demo access requires a MEMBER account');
    }

    return this.createAccessToken(user);
  }

  private async createAccessToken(user: {
    id: string;
    email: string;
    organizationId: string;
    role: string;
  }) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    });

    return {
      accessToken,
    };
  }
}
