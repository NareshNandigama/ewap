import { describe, expect, it, vi } from 'vitest';
import { ProjectService } from './project.service.js';
describe('ProjectService', () => {
  it('rejects another organization before database access', async () => {
    const findMany = vi.fn();
    const service = new ProjectService({ project: { findMany } } as never);
    await expect(
      service.findByOrganization('other', 'current'),
    ).rejects.toThrow('access');
    expect(findMany).not.toHaveBeenCalled();
  });
});
