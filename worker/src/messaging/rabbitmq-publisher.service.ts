import { Injectable,OnModuleDestroy,
  OnModuleInit, } from '@nestjs/common';

import amqp, { Channel, ChannelModel } from 'amqplib';

import {
  WORKFLOW_DLQ_EXCHANGE,
  WORKFLOW_RETRY_EXCHANGE,
} from './messaging.constants.js';

@Injectable()
export class RabbitMqPublisherService implements OnModuleInit, OnModuleDestroy {
  private connection?: ChannelModel;
  private channel?: Channel;

  async onModuleInit(): Promise<void> {
    this.connection = await amqp.connect(
      process.env.RABBITMQ_URL!,
    );

    this.channel = await this.connection.createChannel();
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  async publishRetry(
    data: {
      runId: string;
      workflowId: string;
    },
    retryCount: number,
  ): Promise<void> {
    this.channel?.publish(
      WORKFLOW_RETRY_EXCHANGE,
      'workflow.retry',
      Buffer.from(JSON.stringify({
            pattern: 'workflow.execute',
            data,
        })),
      {
        persistent: true,
        headers: {
          'x-retry-count': retryCount,
        },
      },
    );
  }

  async publishToDlq(
    data: {
      runId: string;
      workflowId: string;
    },
    retryCount: number,
  ): Promise<void> {
    this.channel?.publish(
      WORKFLOW_DLQ_EXCHANGE,
      'workflow.dead',
      Buffer.from(JSON.stringify({
        pattern: 'workflow.execute',
        data,
      })),
      {
        persistent: true,
        headers: {
          'x-retry-count': retryCount,
        },
      },
    );
  }
}