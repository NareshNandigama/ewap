import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Client } from 'pg';
import { EventEmitter } from 'node:events';
import { PrismaService } from '../prisma/prisma.service.js';
import { databaseConfig } from '../prisma/database-config.js';
export interface WorkflowHint {
  organizationId: string;
  runId: string;
  status: string;
}
@Injectable()
export class WorkflowFanoutService implements OnModuleInit, OnModuleDestroy {
  private readonly events = new EventEmitter();
  private client?: Client;
  private reconnect?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private ready = false;
  constructor(private readonly prisma: PrismaService) {}
  isReady() {
    return this.ready;
  }
  onModuleInit() {
    return this.connect();
  }
  private async connect() {
    if (this.stopped) return;
    const client = new Client(databaseConfig());
    this.client = client;
    let failed = false;
    const lost = () => {
      if (failed) return;
      failed = true;
      this.ready = false;
      void client.end().catch(() => undefined);
      if (!this.stopped)
        this.reconnect = setTimeout(() => {
          void this.connect();
        }, 2000);
    };
    client.on('error', lost);
    client.on('end', lost);
    client.on('notification', (message) => {
      if (message.channel !== 'ewap_workflow_hints' || !message.payload) return;
      try {
        const hint = JSON.parse(message.payload);
        if (
          typeof hint.organizationId === 'string' &&
          typeof hint.runId === 'string' &&
          ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'].includes(
            hint.status,
          )
        )
          this.events.emit('hint', hint);
      } catch {
        /* Invalid payloads never reach sockets. */
      }
    });
    try {
      await client.connect();
      await client.query('LISTEN ewap_workflow_hints');
      if (!failed) {
        this.ready = true;
        this.events.emit('resync');
      }
    } catch {
      lost();
    }
  }
  subscribe(listener: (hint: WorkflowHint) => void, resync: () => void) {
    this.events.on('hint', listener);
    this.events.on('resync', resync);
    return () => {
      this.events.off('hint', listener);
      this.events.off('resync', resync);
    };
  }
  async publish(hint: WorkflowHint) {
    await this.prisma
      .$executeRaw`SELECT pg_notify('ewap_workflow_hints', ${JSON.stringify(hint)})`;
  }
  async onModuleDestroy() {
    this.stopped = true;
    this.ready = false;
    clearTimeout(this.reconnect);
    await this.client?.end().catch(() => undefined);
    this.events.removeAllListeners();
  }
}
