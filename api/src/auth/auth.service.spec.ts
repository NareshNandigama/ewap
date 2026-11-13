import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { Prisma } from '../generated/prisma/index.js';
vi.mock('./password.js', () => ({
  hashAccountPassword: vi.fn(async () => 'test-hash'),
}));
const dto = {
  name: 'Owner',
  email: 'owner@example.invalid',
  password: 'password',
  organizationName: 'New organization',
};
describe('AuthService registration', () => {
  function setup() {
    const user = {
      id: 'owner',
      name: dto.name,
      email: dto.email,
      role: 'ADMIN',
      organizationId: 'new-org',
    };
    const prisma = {
      organization: {
        create: vi.fn().mockResolvedValue({
          id: 'new-org',
          name: dto.organizationName,
          users: [user],
        }),
      },
    };
    const jwt = { signAsync: vi.fn().mockResolvedValue('token') };
    return {
      service: new AuthService(
        prisma as never,
        jwt as never,
        new ConfigService(),
      ),
      prisma,
      jwt,
    };
  }
  it('atomically nests one ADMIN in a newly created organization', async () => {
    const { service, prisma, jwt } = setup();
    const response = await service.register({
      ...dto,
      organizationId: 'existing-org',
      role: 'MEMBER',
    } as never);
    expect(prisma.organization.create.mock.calls[0][0].data).toEqual({
      name: dto.organizationName,
      users: {
        create: {
          name: dto.name,
          email: dto.email,
          passwordHash: 'test-hash',
          role: 'ADMIN',
        },
      },
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'new-org', role: 'ADMIN' }),
    );
    expect(response.accessToken).toBe('token');
    expect(response).not.toHaveProperty('passwordHash');
  });
  it('translates duplicate email constraints without issuing a token', async () => {
    const { service, prisma, jwt } = setup();
    prisma.organization.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.register(dto)).rejects.toMatchObject({ status: 409 });
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});

describe('Public demo access', () => {
  it.each(['ADMIN', 'MEMBER'])(
    'only issues a demo token for MEMBER accounts: %s',
    async (role) => {
      const user = {
        id: 'demo-user',
        email: 'demo@example.invalid',
        organizationId: 'demo-org',
        role,
      };
      const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } };
      const jwt = { signAsync: vi.fn().mockResolvedValue('token') };
      const service = new AuthService(
        prisma as never,
        jwt as never,
        new ConfigService({ DEMO_USER_EMAIL: user.email }),
      );
      if (role === 'MEMBER') {
        await expect(service.demoLogin()).resolves.toEqual({
          accessToken: 'token',
        });
        expect(jwt.signAsync).toHaveBeenCalledOnce();
      } else {
        await expect(service.demoLogin()).rejects.toMatchObject({
          status: 404,
        });
        expect(jwt.signAsync).not.toHaveBeenCalled();
      }
    },
  );
});
