import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import amqp, { Channel, ChannelModel } from 'amqplib';
import {
  RETRY_DELAY_MS,
  WORKFLOW_DLQ,
  WORKFLOW_EXCHANGE,
  WORKFLOW_QUEUE,
  WORKFLOW_RETRY_EXCHANGE,
  WORKFLOW_RETRY_QUEUE,
  WORKFLOW_DLQ_EXCHANGE,
} from './messaging.constants.js';

@Injectable()
export class RabbitMqTopologyService
  implements OnModuleInit, OnModuleDestroy
{
  private connection?: ChannelModel;
  private channel?: Channel;

  async onModuleInit(): Promise<void> {
    this.connection = await amqp.connect(
      process.env.RABBITMQ_URL!,
    );

    this.channel = await this.connection.createChannel();

    // Main exchange
    await this.channel.assertExchange(
      WORKFLOW_EXCHANGE,
      'direct',
      {
        durable: true,
      },
    );

    // Retry exchange
    await this.channel.assertExchange(
      WORKFLOW_RETRY_EXCHANGE,
      'direct',
      {
        durable: true,
      },
    );

    // DLQ exchange
    await this.channel.assertExchange(
        WORKFLOW_DLQ_EXCHANGE,
        'direct',
        {
            durable: true,
        },
    );

    // Main workflow queue
    await this.channel.assertQueue(
      WORKFLOW_QUEUE,
      {
        durable: true,
        deadLetterExchange: WORKFLOW_DLQ_EXCHANGE,
        deadLetterRoutingKey:'workflow.dead',
      },
    );

    // Retry queue
    await this.channel.assertQueue(
        WORKFLOW_RETRY_QUEUE,
        {
            durable: true,

            // Wait 5 seconds before retrying
            messageTtl: RETRY_DELAY_MS,

            // After TTL, send back to main exchange
            deadLetterExchange:
            WORKFLOW_EXCHANGE,

            // IMPORTANT:
            // Change routing key back to workflow.execute
            deadLetterRoutingKey:
            'workflow.execute',
        },
    );

    // Dead-letter queue
    await this.channel.assertQueue(
      WORKFLOW_DLQ,
      {
        durable: true,
      },
    );

    // Main exchange → main queue
    await this.channel.bindQueue(
      WORKFLOW_QUEUE,
      WORKFLOW_EXCHANGE,
      'workflow.execute',
    );

    // Retry exchange → retry queue
    await this.channel.bindQueue(
      WORKFLOW_RETRY_QUEUE,
      WORKFLOW_RETRY_EXCHANGE,
      'workflow.retry',
    );

    // DLQ exchange → DLQ queue
    await this.channel.bindQueue(
        WORKFLOW_DLQ,
        WORKFLOW_DLQ_EXCHANGE,
        'workflow.dead',
    );

    // Log topology creation
    console.log('🐇 RabbitMQ topology initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}