import { describe, expect, it, vi } from 'vitest';
import { ProjectController } from './project.controller.js';
describe('ProjectController', () => {
  it('uses the authenticated tenant for project reads', () => {
    const service = { findOne: vi.fn() };
    new ProjectController(service as never).findOne('project', {
      sub: 'user',
      organizationId: 'org',
      role: 'MEMBER',
    });
    expect(service.findOne).toHaveBeenCalledWith('project', 'org');
  });
});
