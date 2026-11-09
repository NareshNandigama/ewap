import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';

const { client, RedisClient } = vi.hoisted(() => {
  const client = {
    status: 'wait',
    on: vi.fn(),
    connect: vi.fn(),
    quit: vi.fn(),
    get: vi.fn(),
  };
  return {
    client,
    RedisClient: vi.fn(function () {
      return client;
    }),
  };
});

vi.mock('ioredis', () => ({ Redis: RedisClient }));

import { RedisService } from './redis.service.js';

describe('RedisService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.status = 'wait';
    client.connect.mockResolvedValue(undefined);
    client.quit.mockResolvedValue('OK');
  });

  it('connects at startup so availability-gated cache callers can use Redis', async () => {
    const service = new RedisService(
      new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );
    client.connect.mockImplementation(async () => {
      client.status = 'ready';
    });
    client.get.mockResolvedValue('{"id":"run-1"}');

    service.onModuleInit();

    expect(RedisClient).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.objectContaining({ lazyConnect: true }),
    );
    expect(client.connect).toHaveBeenCalledOnce();
    expect(service.isAvailable()).toBe(true);
    await expect(service.get('run-1')).resolves.toEqual({ id: 'run-1' });
    expect(client.connect).toHaveBeenCalledOnce();
    await service.onModuleDestroy();
    expect(client.quit).toHaveBeenCalledOnce();
  });

  it('does not block startup when Redis is still connecting', async () => {
    const service = new RedisService(
      new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );
    let finishConnection!: () => void;
    client.connect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishConnection = resolve;
        }),
    );

    expect(service.onModuleInit()).toBeUndefined();
    expect(service.isAvailable()).toBe(false);

    client.status = 'ready';
    finishConnection();
    await Promise.resolve();
    expect(service.isAvailable()).toBe(true);
  });

  it('handles a startup connection failure and becomes available after recovery', async () => {
    const service = new RedisService(
      new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );
    client.connect.mockRejectedValue(new Error('Connection refused'));

    expect(() => service.onModuleInit()).not.toThrow();
    await Promise.resolve();
    expect(service.isAvailable()).toBe(false);

    client.status = 'ready';
    expect(service.isAvailable()).toBe(true);
  });

  it('should remain disabled when REDIS_URL is missing', async () => {
    const service = new RedisService(
      new ConfigService({ REDIS_URL: undefined }),
    );

    expect(() => service.onModuleInit()).not.toThrow();
    expect(service.isAvailable()).toBe(false);
    expect(RedisClient).not.toHaveBeenCalled();
    await expect(service.get('workflow-runs:test')).resolves.toBeNull();
    await expect(
      service.set('workflow-runs:test', { ok: true }, 60),
    ).resolves.toBe(false);
    await expect(service.del('workflow-runs:test')).resolves.toBe(false);
  });
});
