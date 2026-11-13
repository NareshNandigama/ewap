import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowConsumerService } from './workflow-consumer.service.js';
function setup() {
  const prisma = {
    workflowRun: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    workflowExecutionLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const status = { notify: vi.fn().mockResolvedValue(false) };
  return {
    prisma,
    status,
    service: new WorkflowConsumerService(prisma as never, status as never),
  };
}
describe('WorkflowConsumerService', () => {
  afterEach(() => vi.useRealTimers());
  it('retains SUCCESS when notifications cannot be delivered', async () => {
    vi.useFakeTimers();
    const { service, prisma, status } = setup();
    const pending = service.executeWorkflow('run-1', 0);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toBe(true);
    expect(prisma.workflowRun.update).toHaveBeenCalledOnce();
    expect(prisma.workflowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCESS' }),
      }),
    );
    expect(status.notify.mock.calls.map((call) => call[1])).toEqual([
      'RUNNING',
      'SUCCESS',
    ]);
  });
  it('does not execute duplicate deliveries', async () => {
    const { service, prisma, status } = setup();
    prisma.workflowRun.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.executeWorkflow('run-1', 0)).resolves.toBe(false);
    expect(status.notify).not.toHaveBeenCalled();
    expect(prisma.workflowExecutionLog.create).not.toHaveBeenCalled();
  });
});
