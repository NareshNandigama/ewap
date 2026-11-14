import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkerStatusClient } from './worker-status.client.js';

@Injectable()
export class StatusOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatusOutboxService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WorkerStatusClient,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (!this.running && !this.stopped)
        this.running = this.tick()
          .catch(() => {
            this.logger.warn('Outbox delivery deferred');
          })
          .finally(() => {
            this.running = undefined;
          });
    }, 1000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    this.stopped = true;
    clearInterval(this.timer);
    await this.running;
  }
  async tick() {
    const events = await this.prisma.workflowOutbox.findMany({
      where: {
        kind: 'STATUS',
        deliveredAt: null,
        availableAt: { lte: new Date() },
        OR: [{ leasedUntil: null }, { leasedUntil: { lt: new Date() } }],
      },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });
    for (const event of events) {
      if (this.stopped) break;
      const leaseToken = randomUUID();
      const claimed = await this.prisma.workflowOutbox.updateMany({
        where: {
          id: event.id,
          deliveredAt: null,
          OR: [{ leasedUntil: null }, { leasedUntil: { lt: new Date() } }],
        },
        data: { leaseToken, leasedUntil: new Date(Date.now() + 60000) },
      });
      if (!claimed.count) continue;
      try {
        if (!(await this.client.notify(event.runId, event.status!)))
          throw new Error('Status delivery pending');
        await this.prisma.workflowOutbox.updateMany({
          where: { id: event.id, leaseToken },
          data: {
            deliveredAt: new Date(),
            leaseToken: null,
            leasedUntil: null,
          },
        });
      } catch {
        await this.prisma.workflowOutbox.updateMany({
          where: { id: event.id, leaseToken },
          data: {
            availableAt: new Date(Date.now() + 5000),
            leaseToken: null,
            leasedUntil: null,
          },
        });
      }
    }
  }
}
