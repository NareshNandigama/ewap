import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { ExecutionContext } from '@nestjs/common';
const jwt = new JwtService({ secret: 'unit-test-secret' });
const guard = new JwtAuthGuard(jwt, new Reflector());
function context(authorization?: string) {
  const request = { headers: { authorization }, user: undefined };
  return {
    request,
    context: {
      getHandler: () => () => {},
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}
describe('JwtAuthGuard', () => {
  it('accepts valid tenant identity claims', async () => {
    const { request, context: ctx } = context(
      'Bearer ' +
        (await jwt.signAsync({
          sub: 'user',
          organizationId: 'org',
          role: 'MEMBER',
        })),
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toMatchObject({ organizationId: 'org' });
  });
  it.each([
    {},
    { sub: 'user', role: 'ADMIN' },
    { sub: 'user', organizationId: 'org', role: 'SUPERUSER' },
    { sub: '', organizationId: 'org', role: 'MEMBER' },
  ])('rejects malformed signed claims %#', async (claims) => {
    const { context: ctx } = context('Bearer ' + (await jwt.signAsync(claims)));
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 401 });
  });
  it('rejects missing and invalid credentials', async () => {
    for (const header of [undefined, 'Bearer invalid']) {
      await expect(
        guard.canActivate(context(header).context),
      ).rejects.toMatchObject({ status: 401 });
    }
  });
});
