import { createHash } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { RedisService } from '../redis/redis.service.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.get<boolean>('RATE_LIMIT_ENABLED', true) === false)
      return true;
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const res = context.switchToHttp().getResponse<Response>();
    const auth = context.getClass().name === 'AuthController';
    const action = context.getHandler().name;
    const hash = (value: string) =>
      createHash('sha256').update(value).digest('hex');
    const quotas: [string, number, number][] = auth
      ? [
          [
            `auth:${action}:ip:${hash(req.ip ?? req.socket.remoteAddress ?? 'unknown')}`,
            action === 'register' ? 5 : 20,
            60000,
          ],
        ]
      : [];
    if (auth && action === 'login' && typeof req.body?.email === 'string') {
      quotas.push([
        `auth:account:${hash(req.body.email.trim().toLowerCase())}`,
        10,
        60000,
      ]);
    }
    if (!auth) {
      // The controller JWT guard runs first; never accept tenant IDs from request bodies.
      if (!req.user?.organizationId || !req.user.sub)
        throw new ServiceUnavailableException('Quota identity unavailable');
      quotas.push([`ai:tenant:${hash(req.user.organizationId)}`, 60, 60000]);
      quotas.push([
        `ai:user:${hash(JSON.stringify([req.user.organizationId, req.user.sub]))}`,
        15,
        60000,
      ]);
    }
    let retryMs = 0;
    try {
      for (const [key, limit, window] of quotas) {
        retryMs = Math.max(
          retryMs,
          await this.redis.consumeRateLimit(
            `ewap:quota:v1:${key}`,
            limit,
            window,
          ),
        );
      }
    } catch {
      res.setHeader('Retry-After', '1');
      throw new ServiceUnavailableException('Rate limit store unavailable');
    }
    if (retryMs > 0) {
      res.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil(retryMs / 1000))),
      );
      throw new HttpException('Too many requests', 429);
    }
    return true;
  }
}
