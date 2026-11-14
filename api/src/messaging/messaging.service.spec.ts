import { describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { MessagingService } from './messaging.service.js';
describe('broker readiness and confirmed dispatch', () => {
  it('reflects connected, disconnected, and blocked broker state', async () => {
    const status = new Subject<string>();
    const client = {
      status,
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    };
    const service = new MessagingService(client as never);
    await expect(service.isReady()).resolves.toBe(false);
    status.next('connected');
    await expect(service.isReady()).resolves.toBe(true);
    status.next('blocked');
    await expect(service.isReady()).resolves.toBe(false);
    status.next('unblocked');
    await expect(service.isReady()).resolves.toBe(true);
    status.next('disconnected');
    await expect(service.isReady()).resolves.toBe(false);
    await service.onModuleDestroy();
    expect(client.close).toHaveBeenCalledOnce();
  });
  it('does not require the broker when intentionally disabled', async () => {
    const service = new MessagingService(undefined);
    expect(service.isEnabled()).toBe(false);
    await expect(service.isReady()).resolves.toBe(true);
  });
  it('waits for the dispatch observable to confirm the persistent message', async () => {
    const confirmed = new Subject<void>();
    const client = {
      status: new Subject(),
      emit: vi.fn().mockReturnValue(confirmed),
    };
    const service = new MessagingService(client as never);
    let done = false;
    const pending = service
      .publishWorkflowRun('run', 'workflow', 2)
      .then(() => {
        done = true;
      });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(client.emit.mock.calls[0][1].options).toMatchObject({
      persistent: true,
      headers: { 'x-retry-count': '2' },
    });
    confirmed.next();
    await pending;
    expect(done).toBe(true);
  });
});
