import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { MessagingService } from '../messaging/messaging.service.js';

@Injectable()
export class DispatchOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchOutboxService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: MessagingService,
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
    if (!this.client.isEnabled()) return;

    // A broker redelivery alone cannot recover a lease if an active duplicate was ACKed.
    // A stable recovery key leaves one durable dispatch per abandoned attempt.
    const abandoned = await this.prisma.workflowRun.findMany({
      where: {
        dispatchEnabled: true,
        status: 'RUNNING',
        leaseExpiresAt: { lt: new Date() },
      },
      take: 50,
    });
    for (const run of abandoned)
      await this.prisma.workflowOutbox.upsert({
        where: { key: `recover:${run.id}:${run.executionToken}` },
        update: {},
        create: {
          key: `recover:${run.id}:${run.executionToken}`,
          kind: 'EXECUTE',
          runId: run.id,
          workflowId: run.workflowId,
          retryCount: run.executionRetry,
        },
      });

    const events = await this.prisma.workflowOutbox.findMany({
      where: {
        kind: 'EXECUTE',
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
        await this.client.publishWorkflowRun(
          event.runId,
          event.workflowId,
          event.retryCount,
        );
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
