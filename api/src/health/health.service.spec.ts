import { describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service.js';
function setup() {
  const db = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
  const fanout = { isReady: vi.fn().mockReturnValue(true) };
  const messaging = { isReady: vi.fn().mockResolvedValue(true) };
  return {
    db,
    fanout,
    messaging,
    service: new HealthService(
      { get: vi.fn() } as never,
      db as never,
      fanout as never,
      messaging as never,
    ),
  };
}
describe('readiness', () => {
  it('requires the database and status subscriber to be ready', async () => {
    const { service, fanout } = setup();
    await expect(service.readiness()).resolves.toEqual({ status: 'ready' });
    fanout.isReady.mockReturnValue(false);
    await expect(service.readiness()).rejects.toThrow('not ready');
  });
  it('fails when the enabled broker or database is unavailable', async () => {
    const { service, messaging, db } = setup();
    messaging.isReady.mockResolvedValue(false);
    await expect(service.readiness()).rejects.toThrow('not ready');
    db.$queryRaw.mockRejectedValue(new Error('unreachable'));
    await expect(service.readiness()).rejects.toThrow('not ready');
  });
});
