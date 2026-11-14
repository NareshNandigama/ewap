import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller.js';
describe('HealthController', () => {
  it('keeps readiness separate from liveness', async () => {
    const health = {
      getHealth: vi.fn().mockReturnValue({ status: 'ok' }),
      readiness: vi.fn().mockResolvedValue({ status: 'ready' }),
    };
    const controller = new HealthController(health as never);
    expect(controller.getHealth()).toEqual({ status: 'ok' });
    await expect(controller.ready()).resolves.toEqual({ status: 'ready' });
  });
});
