import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  connect,
  type AmqpConnectionManager,
  type ChannelWrapper,
} from 'amqp-connection-manager';
import type { ConfirmChannel, Message } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { setupTopology } from './rabbitmq-topology.service.js';
import {
  WORKFLOW_DLQ_EXCHANGE,
  WORKFLOW_RETRY_EXCHANGE,
} from './messaging.constants.js';

@Injectable()
export class RabbitMqPublisherService implements OnModuleInit, OnModuleDestroy {
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;
  private readonly returned = new Set<string>();
  private pending = 0;
  private readonly pendingIds = new Set<string>();
  onModuleInit() {
    this.connection = connect([process.env.RABBITMQ_URL!], {
      heartbeatIntervalInSeconds: 5,
      reconnectTimeInSeconds: 2,
    });
    this.connection.on('disconnect', () => {
      /* ChannelWrapper reconnects. */
    });
    this.channel = this.connection.createChannel({
      confirm: true,
      publishTimeout: 10000,
      setup: async (channel: ConfirmChannel) => {
        channel.on('return', (message: Message) => {
          if (
            message.properties.messageId &&
            this.pendingIds.has(message.properties.messageId)
          )
            this.returned.add(message.properties.messageId);
        });
        await setupTopology(channel);
      },
    });
    this.channel.on('error', () => {
      /* Outgoing calls report failure to the consumer. */
    });
  }
  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
  publishRetry(
    data: { runId: string; workflowId: string },
    retryCount: number,
  ) {
    return this.publish(
      WORKFLOW_RETRY_EXCHANGE,
      'workflow.retry',
      data,
      retryCount,
    );
  }
  publishToDlq(
    data: { runId: string; workflowId: string },
    retryCount: number,
  ) {
    return this.publish(
      WORKFLOW_DLQ_EXCHANGE,
      'workflow.dead',
      data,
      retryCount,
    );
  }
  private async publish(
    exchange: string,
    routingKey: string,
    data: object,
    retryCount: number,
  ) {
    if (!this.channel || this.pending >= 16)
      throw new Error('Publisher unavailable or full');
    const messageId = randomUUID();
    this.pending++;
    this.pendingIds.add(messageId);
    try {
      // ChannelWrapper respects socket drain and resolves only after broker confirmation.
      await this.channel.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify({ pattern: 'workflow.execute', data })),
        {
          persistent: true,
          mandatory: true,
          messageId,
          timeout: 10000,
          headers: { 'x-retry-count': retryCount },
        },
      );
      // RabbitMQ sends basic.return before the confirmation for an unroutable message.
      if (this.returned.has(messageId))
        throw new Error('Unroutable workflow handoff');
    } finally {
      this.pending--;
      this.returned.delete(messageId);
      this.pendingIds.delete(messageId);
    }
  }
}
