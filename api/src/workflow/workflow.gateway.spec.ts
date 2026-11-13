import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowGateway, workflowRoom } from './workflow.gateway.js';

describe('WorkflowGateway', () => {
  afterEach(() => vi.useRealTimers());
  it('sends updates only to a server-selected tenant room', () => {
    const gateway = new WorkflowGateway({} as never, {} as never);
    const emit = vi.fn(),
      to = vi.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;
    gateway.broadcastWorkflowStatus('org-a', 'run-a', 'RUNNING');
    expect(to).toHaveBeenCalledWith(workflowRoom('org-a'));
    expect(emit).toHaveBeenCalledWith('workflow.status.changed', {
      runId: 'run-a',
      status: 'RUNNING',
    });
  });
  it('joins the verified tenant room and disconnects at expiry', async () => {
    vi.useFakeTimers();
    const gateway = new WorkflowGateway({} as never, {} as never);
    const socket = {
      connected: true,
      data: {
        identity: { organizationId: 'org-a', expiresAt: Date.now() + 1000 },
      },
      join: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };
    await gateway.handleConnection(socket as never);
    expect(socket.join).toHaveBeenCalledWith(workflowRoom('org-a'));
    expect(socket.emit).toHaveBeenCalledWith('workflow.updates.ready');
    await vi.advanceTimersByTimeAsync(1000);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    gateway.handleDisconnect(socket as never);
  });
  it('rejects connections without a verified identity', async () => {
    const socket = { data: {}, disconnect: vi.fn(), join: vi.fn() };
    await new WorkflowGateway({} as never, {} as never).handleConnection(
      socket as never,
    );
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });
});
