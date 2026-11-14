import { databaseConfig } from './database-config.js';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/index.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg(databaseConfig(process.env, true));

    super({ adapter });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
