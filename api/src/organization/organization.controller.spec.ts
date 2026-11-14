import { describe, expect, it, vi } from 'vitest';
import { OrganizationController } from './organization.controller.js';
describe('OrganizationController', () => {
  it('passes authenticated scope to both reads', async () => {
    const service = { findAll: vi.fn(), findOne: vi.fn() };
    const controller = new OrganizationController(service as never);
    const actor = {
      sub: 'user',
      organizationId: 'org-a',
      role: 'MEMBER',
      email: 'test@example.invalid',
    };
    await controller.findAll(actor);
    await controller.findOne('org-b', actor);
    expect(service.findAll).toHaveBeenCalledWith('org-a');
    expect(service.findOne).toHaveBeenCalledWith('org-b', 'org-a');
  });
});
