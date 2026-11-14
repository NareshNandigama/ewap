import { describe, it, expect, vi } from 'vitest';
import { WorkflowRunController } from './workflow-run.controller.js';
describe('WorkflowRunController', () => {
  it('preserves JWT organization scope for normal run operations', async () => {
    const runs = {
      findAll: vi.fn(),
      create: vi.fn(),
      findByWorkflow: vi.fn(),
      findOne: vi.fn(),
    };
    const controller = new WorkflowRunController(runs as never);
    const user = {
      sub: 'user',
      organizationId: 'org-a',
      role: 'MEMBER',
      email: 'test@example.invalid',
    };
    await controller.findAll(user);
    await controller.create('workflow', user);
    await controller.findByWorkflow('workflow', user);
    await controller.findOne('run', user);
    expect(runs.findAll).toHaveBeenCalledWith('org-a');
    expect(runs.create).toHaveBeenCalledWith('workflow', 'org-a', undefined);
    expect(runs.findOne).toHaveBeenCalledWith('run', 'org-a');
  });
});
