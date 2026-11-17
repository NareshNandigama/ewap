import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../redis/redis.service.js';

const url = process.env.RATE_LIMIT_TEST_REDIS_URL;
describe.skipIf(!url)('real Redis atomic quotas', () => {
  it('admits exactly the quota concurrently across replicas, expires, and fails closed', async () => {
    const services = [0, 1].map(
      () => new RedisService(new ConfigService({ REDIS_URL: url })),
    );
    const client = new Redis(url!);
    const key = `ewap:test:quota:${randomUUID()}`;
    try {
      services.forEach((s) => s.onModuleInit());
      for (let i = 0; i < 100 && !services.every((s) => s.isAvailable()); i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const results = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          services[i % 2].consumeRateLimit(key, 10, 500),
        ),
      );
      expect(results.filter((r) => r === 0)).toHaveLength(10);
      expect(results.filter((r) => r > 0)).toHaveLength(90);
      expect(await client.pttl(key)).toBeGreaterThan(0);
      expect(await services[0].consumeRateLimit(`${key}:other`, 10, 500)).toBe(
        0,
      );
      await new Promise((resolve) => setTimeout(resolve, 550));
      expect(await services[1].consumeRateLimit(key, 10, 500)).toBe(0);
      await services[0].onModuleDestroy();
      await expect(
        services[0].consumeRateLimit(key, 10, 500),
      ).rejects.toThrow();
    } finally {
      await client.del(key, `${key}:other`);
      await client.quit();
      await Promise.all(services.map((s) => s.onModuleDestroy()));
    }
  });
});
