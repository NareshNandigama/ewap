import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis as RedisClient } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: RedisClient;
  private readonly redisUrl?: string;

  constructor(private readonly configService: ConfigService) {
    this.redisUrl = this.configService.get<string | undefined>('REDIS_URL');
  }

  onModuleInit(): void {
    if (!this.redisUrl || !this.redisUrl.trim()) {
      this.logger.debug('REDIS_URL is not configured; Redis caching is disabled.');
      return;
    }

    try {
      this.client = new RedisClient(this.redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
      });

      this.client.on('error', () => {
        // Redis is optional for the API. Keep this quiet unless we explicitly need it.
      });
    } catch (error) {
      this.client = undefined;
      this.logger.debug(
        `Redis initialization failed: ${this.formatError(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client || this.client.status === 'end') {
      return;
    }

    try {
      await this.client.quit();
    } catch {
      // Ignore shutdown failures; Redis is optional and may already be unavailable.
    }
  }

  isAvailable(): boolean {
    return Boolean(this.client && this.client.status === 'ready');
  }

  async ping(): Promise<boolean> {
    const redis = await this.getReadyClient();
    if (!redis) {
      return false;
    }

    try {
      return (await redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const redis = await this.getReadyClient();
    if (!redis) {
      return null;
    }

    try {
      const cached = await redis.get(key);
      if (cached === null) {
        return null;
      }

      return JSON.parse(cached) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    const redis = await this.getReadyClient();
    if (!redis) {
      return false;
    }

    try {
      const payload = JSON.stringify(value);
      if (typeof ttlSeconds === 'number' && ttlSeconds > 0) {
        await redis.set(key, payload, 'EX', ttlSeconds);
      } else {
        await redis.set(key, payload);
      }
      return true;
    } catch {
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    const redis = await this.getReadyClient();
    if (!redis) {
      return false;
    }

    try {
      await redis.del(key);
      return true;
    } catch {
      return false;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    const redis = await this.getReadyClient();
    if (!redis) {
      return [];
    }

    try {
      return await redis.keys(pattern);
    } catch {
      return [];
    }
  }

  async flushPattern(pattern: string): Promise<number> {
    const keys = await this.keys(pattern);
    if (keys.length === 0) {
      return 0;
    }

    const redis = await this.getReadyClient();
    if (!redis) {
      return 0;
    }

    try {
      return await redis.del(...keys);
    } catch {
      return 0;
    }
  }

  private async getReadyClient(): Promise<RedisClient | undefined> {
    if (!this.client || !this.redisUrl || !this.redisUrl.trim()) {
      return undefined;
    }

    if (this.client.status === 'ready') {
      return this.client;
    }

    try {
      await this.client.connect();
      return this.client;
    } catch {
      return undefined;
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
