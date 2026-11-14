import { describe, expect, it, vi } from 'vitest';
import { OrganizationService } from './organization.service.js';
function setup() {
  const organization = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: 'org-a' }),
  };
  return {
    organization,
    service: new OrganizationService({ organization } as never),
  };
}
describe('OrganizationService', () => {
  it('lists only the authenticated organization', async () => {
    const { service, organization } = setup();
    await service.findAll('org-a');
    expect(organization.findMany).toHaveBeenCalledWith({
      where: { id: 'org-a' },
    });
  });
  it('rejects missing scope instead of issuing an unfiltered query', () => {
    const { service, organization } = setup();
    expect(() => service.findAll(undefined as never)).toThrow();
    expect(organization.findMany).not.toHaveBeenCalled();
  });
  it('hides another tenant before querying', async () => {
    const { service, organization } = setup();
    await expect(service.findOne('org-b', 'org-a')).rejects.toMatchObject({
      status: 404,
    });
    expect(organization.findUnique).not.toHaveBeenCalled();
  });
});
