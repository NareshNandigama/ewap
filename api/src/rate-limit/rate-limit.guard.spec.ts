import { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { vi } from 'vitest';
import { RateLimitGuard } from './rate-limit.guard.js';
import type { RedisService } from '../redis/redis.service.js';

function fixture(
  auth = false,
  action = 'ask',
  user: unknown = { sub: 'u', organizationId: 'a' },
) {
  const consumeRateLimit = vi.fn().mockResolvedValue(0);
  const setHeader = vi.fn();
  const req = { user, ip: '127.0.0.1', body: { email: ' User@Example.com ' } };
  const context = {
    getClass: () => ({ name: auth ? 'AuthController' : 'AiController' }),
    getHandler: () => ({ name: action }),
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  const guard = new RateLimitGuard(
    { consumeRateLimit } as unknown as RedisService,
    new ConfigService(),
  );
  return { guard, context, consumeRateLimit, setHeader, req };
}

describe('RateLimitGuard', () => {
  it('shares tenant quota across users and routes but isolates tenants', async () => {
    const f = fixture();
    await f.guard.canActivate(f.context);
    const key = f.consumeRateLimit.mock.calls[0][0];
    f.req.user = { sub: 'other', organizationId: 'a' };
    await f.guard.canActivate(f.context);
    expect(f.consumeRateLimit.mock.calls[2][0]).toBe(key);
    expect(f.consumeRateLimit.mock.calls[3][0]).not.toBe(
      f.consumeRateLimit.mock.calls[1][0],
    );
    f.req.user = { sub: 'u', organizationId: 'b' };
    await f.guard.canActivate(f.context);
    expect(f.consumeRateLimit.mock.calls[4][0]).not.toBe(key);
    expect(key).not.toContain('organization');
  });
  it('returns 429 with rounded-up Retry-After', async () => {
    const f = fixture();
    f.consumeRateLimit.mockResolvedValueOnce(1001);
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
      status: 429,
    });
    expect(f.setHeader).toHaveBeenCalledWith('Retry-After', '2');
  });
  it('fails closed on Redis failure', async () => {
    const f = fixture();
    f.consumeRateLimit.mockRejectedValue(new Error('offline'));
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
      status: 503,
    });
    expect(f.setHeader).toHaveBeenCalledWith('Retry-After', '1');
  });
  it('requires authenticated identity for AI', async () => {
    const f = fixture(false, 'ask', null);
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
      status: 503,
    });
    expect(f.consumeRateLimit).not.toHaveBeenCalled();
  });
  it('limits login by IP and normalized account without storing email', async () => {
    const f = fixture(true, 'login');
    await f.guard.canActivate(f.context);
    const key = f.consumeRateLimit.mock.calls[1][0];
    f.req.body.email = 'user@example.com';
    await f.guard.canActivate(f.context);
    expect(f.consumeRateLimit.mock.calls[3][0]).toBe(key);
    expect(key).not.toContain('example');
  });
  it('supports an explicit development opt-out', async () => {
    const f = fixture();
    const guard = new RateLimitGuard(
      {} as RedisService,
      new ConfigService({ RATE_LIMIT_ENABLED: false }),
    );
    await expect(guard.canActivate(f.context)).resolves.toBe(true);
  });
});
