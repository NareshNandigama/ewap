import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    return this.createAccessToken(user);
  }

  async demoLogin() {
    const demoEmail =
      this.configService.get<string>('DEMO_USER_EMAIL');

    if (!demoEmail) {
      throw new NotFoundException(
        'Demo access is not configured',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: {
        email: demoEmail,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Demo user is not configured',
      );
    }

    return this.createAccessToken(user);
  }

  private async createAccessToken(user: {
    id: string;
    email: string;
    organizationId: string;
    role: string;
  }) {
    const accessToken =
      await this.jwtService.signAsync({
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