import { describe, expect, it, vi } from 'vitest';
import { WorkflowService } from './workflow.service.js';
describe('WorkflowService', () => {
  it('does not create workflows in another tenant project', async () => {
    const db = {
      project: { findFirst: vi.fn().mockResolvedValue(null) },
      workflow: { create: vi.fn() },
    };
    await expect(
      new WorkflowService(db as never).create(
        'project',
        { name: 'workflow' },
        'org',
      ),
    ).rejects.toThrow('not found');
    expect(db.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'project', organizationId: 'org' },
    });
    expect(db.workflow.create).not.toHaveBeenCalled();
  });
});
