import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';

    const adapter = isProduction
      ? new PrismaPg({
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT ?? 5432),
          database: process.env.DB_NAME,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          ssl: {
            rejectUnauthorized: false,
          },
        })
      : new PrismaPg({
          connectionString: process.env.DATABASE_URL,
          ssl: false,
        });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}