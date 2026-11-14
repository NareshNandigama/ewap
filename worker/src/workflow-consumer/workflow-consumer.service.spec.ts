import { describe, expect, it, vi } from 'vitest';
import {
  WorkflowConsumerService,
  WorkflowExecutionFailed,
} from './workflow-consumer.service.js';
function setup() {
  const tx = {
    workflowRun: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ workflowId: 'workflow' }),
      findUnique: vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
    },
    workflowExecutionLog: { create: vi.fn().mockResolvedValue({}) },
    workflowOutbox: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = { ...tx, $transaction: vi.fn((fn) => fn(tx)) };
  const service = new WorkflowConsumerService(prisma as never);
  vi.spyOn(service as any, 'executeSteps').mockResolvedValue(undefined);
  return { service, prisma, tx };
}
describe('recoverable execution', () => {
  it('persists outcome and independent status delivery together', async () => {
    const { service, tx } = setup();
    await expect(service.executeWorkflow('run', 0)).resolves.toBe(true);
    expect(
      tx.workflowOutbox.create.mock.calls.map(([arg]) => arg.data.status),
    ).toEqual(['RUNNING', 'SUCCESS']);
    expect(tx.workflowRun.updateMany.mock.calls[1][0].where).toMatchObject({
      status: 'RUNNING',
      executionToken: expect.any(String),
    });
  });
  it('skips completed duplicates without writing logs/events', async () => {
    const { service, tx } = setup();
    tx.workflowRun.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.executeWorkflow('run', 0)).resolves.toBe(false);
    expect(tx.workflowExecutionLog.create).not.toHaveBeenCalled();
  });
  it('recovers a failed execution after handoff failure without re-executing', async () => {
    const { service, tx } = setup();
    tx.workflowRun.updateMany.mockResolvedValue({ count: 0 });
    tx.workflowRun.findUnique.mockResolvedValue({
      status: 'FAILED',
      executionRetry: 0,
    } as never);
    await expect(service.executeWorkflow('run', 0)).rejects.toBeInstanceOf(
      WorkflowExecutionFailed,
    );
  });
  it('propagates claim/log failure before executing steps', async () => {
    const { service, tx } = setup();
    tx.workflowExecutionLog.create.mockRejectedValue(new Error('database'));
    await expect(service.executeWorkflow('run', 0)).rejects.toThrow('database');
    expect((service as any).executeSteps).not.toHaveBeenCalled();
  });
});
