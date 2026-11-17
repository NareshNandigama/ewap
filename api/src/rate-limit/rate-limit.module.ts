import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module.js';
import { RateLimitGuard } from './rate-limit.guard.js';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [RateLimitGuard],
  exports: [RateLimitGuard, RedisModule],
})
export class RateLimitModule {}
