import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import amqp, { Channel, ChannelModel } from 'amqplib';

import {
  RETRY_DELAY_MS,
  WORKFLOW_DLQ,
  WORKFLOW_DLQ_EXCHANGE,
  WORKFLOW_EXCHANGE,
  WORKFLOW_QUEUE,
  WORKFLOW_RETRY_EXCHANGE,
  WORKFLOW_RETRY_QUEUE,
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

    this.connection.on('error', (error) => {
      console.error(
        '❌ RabbitMQ topology connection error:',
        error.message,
      );
    });

    this.connection.on('close', () => {
      console.warn(
        '⚠️ RabbitMQ topology connection closed',
      );
    });

    this.channel = await this.connection.createChannel();

    this.channel.on('error', (error) => {
      console.error(
        '❌ RabbitMQ topology channel error:',
        error.message,
      );
    });

    this.channel.on('close', () => {
      console.warn(
        '⚠️ RabbitMQ topology channel closed',
      );
    });

    await this.channel.assertExchange(
      WORKFLOW_EXCHANGE,
      'direct',
      {
        durable: true,
      },
    );

    await this.channel.assertExchange(
      WORKFLOW_RETRY_EXCHANGE,
      'direct',
      {
        durable: true,
      },
    );

    await this.channel.assertExchange(
      WORKFLOW_DLQ_EXCHANGE,
      'direct',
      {
        durable: true,
      },
    );

    await this.channel.assertQueue(
      WORKFLOW_QUEUE,
      {
        durable: true,
        deadLetterExchange: WORKFLOW_DLQ_EXCHANGE,
        deadLetterRoutingKey: 'workflow.dead',
      },
    );

    await this.channel.assertQueue(
      WORKFLOW_RETRY_QUEUE,
      {
        durable: true,
        messageTtl: RETRY_DELAY_MS,
        deadLetterExchange: WORKFLOW_EXCHANGE,
        deadLetterRoutingKey: 'workflow.execute',
      },
    );

    await this.channel.assertQueue(
      WORKFLOW_DLQ,
      {
        durable: true,
      },
    );

    await this.channel.bindQueue(
      WORKFLOW_QUEUE,
      WORKFLOW_EXCHANGE,
      'workflow.execute',
    );

    await this.channel.bindQueue(
      WORKFLOW_RETRY_QUEUE,
      WORKFLOW_RETRY_EXCHANGE,
      'workflow.retry',
    );

    await this.channel.bindQueue(
      WORKFLOW_DLQ,
      WORKFLOW_DLQ_EXCHANGE,
      'workflow.dead',
    );

    console.log('🐇 RabbitMQ topology initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}