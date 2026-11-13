import { describe, expect, it, vi } from 'vitest';
import { UserController } from './user.controller.js';
describe('UserController', () => {
  it('forwards the authenticated principal for all user operations', async () => {
    const service = {
      create: vi.fn(),
      findByOrganization: vi.fn(),
      findOne: vi.fn(),
    };
    const controller = new UserController(service as never);
    const actor = {
      sub: 'admin',
      organizationId: 'org',
      role: 'ADMIN',
      email: 'test@example.invalid',
    };
    const dto = {
      name: 'Member',
      email: 'member@example.invalid',
      password: 'password',
    };
    await controller.create('org', dto, actor);
    await controller.findByOrganization('org', actor);
    await controller.findOne('member', actor);
    expect(service.create).toHaveBeenCalledWith('org', dto, actor);
    expect(service.findByOrganization).toHaveBeenCalledWith('org', actor);
    expect(service.findOne).toHaveBeenCalledWith('member', actor);
  });
});
