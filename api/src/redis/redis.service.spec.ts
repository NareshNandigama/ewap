import { ConfigService } from '@nestjs/config';

import { RedisService } from './redis.service.js';

describe('RedisService', () => {
  it('should remain disabled when REDIS_URL is missing', async () => {
    const service = new RedisService(new ConfigService({ REDIS_URL: undefined }));

    expect(() => service.onModuleInit()).not.toThrow();
    expect(service.isAvailable()).toBe(false);
    await expect(service.get('workflow-runs:test')).resolves.toBeNull();
    await expect(service.set('workflow-runs:test', { ok: true }, 60)).resolves.toBe(false);
    await expect(service.del('workflow-runs:test')).resolves.toBe(false);
  });
});
