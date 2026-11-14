import { describe, expect, it, vi } from 'vitest';
import { WorkflowController } from './workflow.controller.js';
describe('WorkflowController', () => {
  it('uses the authenticated tenant for workflow reads', () => {
    const service = { findAll: vi.fn() };
    new WorkflowController(service as never).findAll({
      sub: 'user',
      organizationId: 'org',
      role: 'MEMBER',
    });
    expect(service.findAll).toHaveBeenCalledWith('org');
  });
});
