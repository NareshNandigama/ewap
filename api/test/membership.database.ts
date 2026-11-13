/** Real HTTP/JWT/bcrypt/Prisma tests, only in the guarded isolated test database. */
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { randomUUID, randomBytes } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../src/auth/auth.module.js';
import { UserModule } from '../src/user/user.module.js';
import { OrganizationModule } from '../src/organization/organization.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { analyticsTestClient } from './analytics-test-db.js';

const db = analyticsTestClient();
const prefix = `membership-${randomUUID()}`;
const password = 'Synthetic-test-password-123';
interface Account {
  accessToken: string;
  organization: { id: string; name: string };
  user: { id: string; email: string; role: string; organizationId: string };
}

describe('Tenant membership boundaries (real PostgreSQL)', () => {
  let app: INestApplication, base: string, owner: Account, other: Account;
  let member: Account['user'], memberToken: string;
  async function request(path: string, token?: string, body?: unknown) {
    return fetch(`${base}/api/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
  }
  function registration(suffix = randomUUID()) {
    return {
      name: 'Owner',
      email: `${prefix}-${suffix}@example.invalid`,
      password,
      organizationName: `${prefix}-${suffix}`,
    };
  }
  async function register(suffix = randomUUID()) {
    const response = await request(
      '/auth/register',
      undefined,
      registration(suffix),
    );
    expect(response.status).toBe(201);
    return (await response.json()) as Account;
  }
  beforeAll(async () => {
    await db.$connect();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: randomBytes(32).toString('hex') })],
        }),
        AuthModule,
        UserModule,
        OrganizationModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    owner = await register('owner');
    other = await register('other');
    const response = await request(
      `/organizations/${owner.organization.id}/users`,
      owner.accessToken,
      {
        name: 'Member',
        email: `${prefix}-member@example.invalid`,
        password,
      },
    );
    expect(response.status).toBe(201);
    member = await response.json();
    const login = await request('/auth/login', undefined, {
      email: member.email,
      password,
    });
    expect(login.status).toBe(201);
    memberToken = (await login.json()).accessToken;
  });
  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });

  it('creates the first administrator and scopes its returned token to its new organization', async () => {
    expect(owner.user.role).toBe('ADMIN');
    expect(owner.user.organizationId).toBe(owner.organization.id);
    const response = await request('/organizations', owner.accessToken);
    const items = await response.json();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(owner.organization.id);
    expect(
      await db.user.count({
        where: { organizationId: owner.organization.id, role: 'ADMIN' },
      }),
    ).toBe(1);
  });
  it('blocks anonymous creation in an existing tenant before inserting a user', async () => {
    const email = `${prefix}-anonymous@example.invalid`;
    const response = await request(
      `/organizations/${owner.organization.id}/users`,
      undefined,
      { name: 'Intruder', email, password },
    );
    expect(response.status).toBe(401);
    expect(await db.user.count({ where: { email } })).toBe(0);
  });
  it.each(['organizations', 'organization-users', 'user-profile'])(
    'blocks anonymous %s reads',
    async (kind) => {
      const path =
        kind === 'organizations'
          ? '/organizations'
          : kind === 'organization-users'
            ? `/organizations/${owner.organization.id}/users`
            : `/users/${owner.user.id}`;
      expect((await request(path)).status).toBe(401);
    },
  );
  it('rejects the removed orphan-organization bootstrap route', async () => {
    expect(
      (await request('/organizations', undefined, { name: `${prefix}-orphan` }))
        .status,
    ).toBe(404);
    expect(
      await db.organization.count({ where: { name: `${prefix}-orphan` } }),
    ).toBe(0);
  });
  it('requires a same-tenant ADMIN for adding users and directory reads', async () => {
    const body = {
      name: 'Intruder',
      email: `${prefix}-cross@example.invalid`,
      password,
    };
    expect(
      (
        await request(
          `/organizations/${other.organization.id}/users`,
          owner.accessToken,
          body,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/organizations/${other.organization.id}/users`,
          owner.accessToken,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/organizations/${owner.organization.id}/users`,
          memberToken,
          body,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/organizations/${owner.organization.id}/users`,
          memberToken,
        )
      ).status,
    ).toBe(403);
    expect(await db.user.count({ where: { email: body.email } })).toBe(0);
  });
  it('hides another tenant organization and user records', async () => {
    expect(
      (
        await request(
          `/organizations/${other.organization.id}`,
          owner.accessToken,
        )
      ).status,
    ).toBe(404);
    expect(
      (await request(`/users/${other.user.id}`, owner.accessToken)).status,
    ).toBe(404);
  });
  it('allows MEMBER self-profile and own organization but not another profile', async () => {
    expect((await request(`/users/${member.id}`, memberToken)).status).toBe(
      200,
    );
    expect((await request(`/users/${owner.user.id}`, memberToken)).status).toBe(
      404,
    );
    expect(
      (await request(`/organizations/${owner.organization.id}`, memberToken))
        .status,
    ).toBe(200);
  });
  it('ignores submitted ADMIN roles when an administrator adds a member', async () => {
    const response = await request(
      `/organizations/${owner.organization.id}/users`,
      owner.accessToken,
      {
        name: 'Member',
        email: `${prefix}-forged-role@example.invalid`,
        password,
        role: 'ADMIN',
        organizationId: other.organization.id,
      },
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.role).toBe('MEMBER');
    expect(body.organizationId).toBe(owner.organization.id);
    expect(body.passwordHash).toBeUndefined();
    expect(body.password).toBeUndefined();
  });
  it('registration cannot attach a user to a supplied existing organization ID', async () => {
    const response = await request('/auth/register', undefined, {
      ...registration('forged-tenant'),
      organizationId: owner.organization.id,
      role: 'ADMIN',
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.organization.id).not.toBe(owner.organization.id);
    expect(body.user.organizationId).toBe(body.organization.id);
    expect(body.user.passwordHash).toBeUndefined();
  });
  it('never exposes password fields in directory results', async () => {
    const response = await request(
      `/organizations/${owner.organization.id}/users`,
      owner.accessToken,
    );
    expect(response.status).toBe(200);
    for (const user of await response.json()) {
      expect(user.passwordHash).toBeUndefined();
      expect(user.password).toBeUndefined();
    }
  });
  it('concurrent duplicate registration produces one organization and one ADMIN, with no orphan', async () => {
    const body = registration('concurrent');
    const responses = await Promise.all([
      request('/auth/register', undefined, body),
      request('/auth/register', undefined, body),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const organizations = await db.organization.findMany({
      where: { name: body.organizationName },
      include: { users: true },
    });
    expect(organizations).toHaveLength(1);
    expect(organizations[0].users).toHaveLength(1);
    expect(organizations[0].users[0].role).toBe('ADMIN');
  });
  it('rechecks current administrator membership when a JWT role is stale', async () => {
    const stale = await register('stale-role');
    await db.user.update({
      where: { id: stale.user.id },
      data: { role: 'MEMBER' },
    });
    const path = `/organizations/${stale.organization.id}/users`;
    expect((await request(path, stale.accessToken)).status).toBe(403);
    expect(
      (
        await request(path, stale.accessToken, {
          name: 'Member',
          email: `${prefix}-stale-create@example.invalid`,
          password,
        })
      ).status,
    ).toBe(403);
  });
  it.each([
    { password: 'short' },
    { password: 'é'.repeat(37) },
    { organizationName: '  ' },
    { name: '  ' },
  ])(
    'rejects invalid registration input before creating an organization %#',
    async (override) => {
      const body = { ...registration(), ...override };
      expect((await request('/auth/register', undefined, body)).status).toBe(
        400,
      );
      expect(await db.user.count({ where: { email: body.email } })).toBe(0);
    },
  );
  it('returns a conflict for an existing email without inserting another organization', async () => {
    const body = { ...registration('duplicate'), email: owner.user.email };
    expect((await request('/auth/register', undefined, body)).status).toBe(409);
    expect(
      await db.organization.count({ where: { name: body.organizationName } }),
    ).toBe(0);
  });
});
