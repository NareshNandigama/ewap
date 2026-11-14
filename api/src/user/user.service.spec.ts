import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserService } from './user.service.js';
import { hashAccountPassword } from '../auth/password.js';
vi.mock('../auth/password.js', () => ({
  hashAccountPassword: vi.fn(async () => 'test-hash'),
}));
const admin = {
  sub: 'admin-id',
  email: 'admin@example.invalid',
  organizationId: 'org-a',
  role: 'ADMIN',
};
const dto = {
  name: 'Member',
  email: 'member@example.invalid',
  password: 'test-password',
};

function setup() {
  const user = {
    findFirst: vi.fn().mockResolvedValue({ id: admin.sub }),
    create: vi.fn().mockResolvedValue({ id: 'member-id', role: 'MEMBER' }),
    findMany: vi.fn().mockResolvedValue([]),
  };
  const prisma = {
    user,
    $transaction: vi.fn(async (callback) => callback({ user })),
  };
  return { service: new UserService(prisma as never), user, prisma };
}
describe('UserService authorization', () => {
  beforeEach(() => vi.clearAllMocks());
  it('creates only MEMBER accounts after current administrator checks', async () => {
    const { service, user } = setup();
    await service.create('org-a', { ...dto, role: 'ADMIN' } as never, admin);
    expect(user.findFirst).toHaveBeenCalledTimes(2);
    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash: 'test-hash',
          organizationId: 'org-a',
          role: 'MEMBER',
        },
      }),
    );
  });
  it.each([
    { ...admin, role: 'MEMBER' },
    { ...admin, organizationId: 'org-b' },
    { ...admin, sub: '' },
  ])('denies invalid scope/role before hashing %#', async (actor) => {
    const { service, user } = setup();
    await expect(service.create('org-a', dto, actor)).rejects.toMatchObject({
      status: 403,
    });
    expect(hashAccountPassword).not.toHaveBeenCalled();
    expect(user.create).not.toHaveBeenCalled();
  });
  it('rejects a stale ADMIN claim when current membership is not ADMIN', async () => {
    const { service, user } = setup();
    user.findFirst.mockResolvedValue(null);
    await expect(service.create('org-a', dto, admin)).rejects.toMatchObject({
      status: 403,
    });
    expect(hashAccountPassword).not.toHaveBeenCalled();
  });
  it('blocks member directory access', async () => {
    const { service, user } = setup();
    await expect(
      service.findByOrganization('org-a', { ...admin, role: 'MEMBER' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(user.findMany).not.toHaveBeenCalled();
  });
  it('limits administrators to their tenant directory', async () => {
    const { service, user } = setup();
    await service.findByOrganization('org-a', admin);
    expect(user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-a' } }),
    );
  });
  it('limits MEMBER profiles to self and scopes the database lookup', async () => {
    const { service, user } = setup();
    const actor = { ...admin, role: 'MEMBER' };
    await expect(service.findOne('someone-else', actor)).rejects.toMatchObject({
      status: 404,
    });
    expect(user.findFirst).not.toHaveBeenCalled();
    await service.findOne(actor.sub, actor);
    expect(user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: actor.sub, organizationId: actor.organizationId },
      }),
    );
  });
});
