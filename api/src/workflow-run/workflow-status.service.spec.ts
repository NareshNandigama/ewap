import { describe, it, expect, vi } from 'vitest';
import { WorkflowStatusService } from './workflow-status.service.js';

const run = {
  id: 'run-1',
  workflowId: 'workflow-1',
  status: 'RUNNING',
  workflow: { project: { organizationId: 'org-1' } },
};
function setup(available = true) {
  const findUnique = vi
    .fn()
    .mockImplementation(async () => structuredClone(run));
  const redis = {
    isAvailable: () => available,
    del: vi.fn().mockResolvedValue(true),
  };
  const gateway = { broadcastWorkflowStatus: vi.fn() };
  const service = new WorkflowStatusService(
    { workflowRun: { findUnique } } as never,
    redis as never,
    gateway as never,
  );
  return { findUnique, redis, gateway, service };
}
describe('Workflow status notifications', () => {
  it('invalidates exact tenant keys before publishing persisted state', async () => {
    const { service, gateway, redis } = setup();
    gateway.broadcastWorkflowStatus.mockImplementation(() => {
      expect(redis.del).toHaveBeenCalledTimes(3);
    });
    await service.notify({ runId: run.id, status: 'RUNNING' });
    expect(redis.del.mock.calls.map(([key]) => key)).toEqual([
      'org:org-1:workflow-runs:run:run-1',
      'org:org-1:workflow-runs:list',
      'org:org-1:workflows:workflow-1:workflow-runs:list',
    ]);
    expect(gateway.broadcastWorkflowStatus).toHaveBeenCalledWith(
      'org-1',
      'run-1',
      'RUNNING',
    );
  });
  it('waits for invalidation rather than only scheduling it', async () => {
    const { service, gateway, redis } = setup();
    let release!: (value: boolean) => void;
    // One shared promise lets all three deletes complete together.
    const pending = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    redis.del.mockReturnValue(pending);
    const result = service.notify({ runId: run.id, status: 'RUNNING' });
    await vi.waitFor(() => expect(redis.del).toHaveBeenCalledTimes(3));
    expect(gateway.broadcastWorkflowStatus).not.toHaveBeenCalled();
    release(true);
    await result;
    expect(gateway.broadcastWorkflowStatus).toHaveBeenCalledOnce();
  });
  it('rejects obsolete status without cache deletion or notification', async () => {
    const { service, gateway, redis } = setup();
    await expect(
      service.notify({ runId: run.id, status: 'SUCCESS' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(redis.del).not.toHaveBeenCalled();
    expect(gateway.broadcastWorkflowStatus).not.toHaveBeenCalled();
  });
  it('rejects a transition which races with invalidation', async () => {
    const { service, gateway, findUnique } = setup();
    findUnique
      .mockResolvedValueOnce(run)
      .mockResolvedValueOnce({ ...run, status: 'SUCCESS' });
    await expect(
      service.notify({ runId: run.id, status: 'RUNNING' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(gateway.broadcastWorkflowStatus).not.toHaveBeenCalled();
  });
  it('fails closed when active Redis cannot invalidate', async () => {
    const { service, gateway, redis } = setup();
    redis.del.mockResolvedValue(false);
    await expect(
      service.notify({ runId: run.id, status: 'RUNNING' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(gateway.broadcastWorkflowStatus).not.toHaveBeenCalled();
  });
  it('keeps notifications available when optional caching is disabled', async () => {
    const { service, gateway, redis } = setup(false);
    await service.notify({ runId: run.id, status: 'RUNNING' });
    expect(redis.del).not.toHaveBeenCalled();
    expect(gateway.broadcastWorkflowStatus).toHaveBeenCalledOnce();
  });
  it('rejects nonexistent runs', async () => {
    const { service, findUnique, gateway } = setup();
    findUnique.mockResolvedValue(null);
    await expect(
      service.notify({ runId: run.id, status: 'RUNNING' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(gateway.broadcastWorkflowStatus).not.toHaveBeenCalled();
  });
});
