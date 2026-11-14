import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import amqp, { type ChannelModel, type Channel } from 'amqplib';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { RabbitMqPublisherService } from '../src/messaging/rabbitmq-publisher.service.js';
import {
  WORKFLOW_RETRY_QUEUE,
  WORKFLOW_RETRY_EXCHANGE,
  WORKFLOW_DLQ,
} from '../src/messaging/messaging.constants.js';
const url = new URL(process.env.BROKER_HARDENING_URL ?? '');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '15673' ||
  url.username !== 'hardening' ||
  url.pathname !== '/ewap_hardening'
)
  throw new Error('Only the dedicated loopback hardening broker is permitted');
process.env.RABBITMQ_URL = url.href;
let connection: ChannelModel, channel: Channel;
const publisher = new RabbitMqPublisherService();
beforeAll(async () => {
  connection = await amqp.connect(url.href);
  channel = await connection.createChannel();
  publisher.onModuleInit();
  await (publisher as any).channel.waitForConnect();
});
afterAll(async () => {
  await publisher.onModuleDestroy();
  await channel?.close();
  await connection?.close();
});
const data = () => ({ runId: randomUUID(), workflowId: randomUUID() });
describe('real RabbitMQ confirmed handoff', () => {
  it('confirms a persistent retry with its attempt header', async () => {
    const body = data();
    await publisher.publishRetry(body, 2);
    const message = await channel.get(WORKFLOW_RETRY_QUEUE, { noAck: false });
    expect(message).not.toBe(false);
    if (!message) return;
    expect(message.properties.deliveryMode).toBe(2);
    expect(message.properties.headers?.['x-retry-count']).toBe(2);
    expect(JSON.parse(message.content.toString()).data).toEqual(body);
    channel.ack(message);
  });
  it('rejects unroutable retry publication despite broker confirmation', async () => {
    await channel.unbindQueue(
      WORKFLOW_RETRY_QUEUE,
      WORKFLOW_RETRY_EXCHANGE,
      'workflow.retry',
    );
    try {
      await expect(publisher.publishRetry(data(), 1)).rejects.toThrow(
        'Unroutable',
      );
    } finally {
      await channel.bindQueue(
        WORKFLOW_RETRY_QUEUE,
        WORKFLOW_RETRY_EXCHANGE,
        'workflow.retry',
      );
    }
  });
  it('reconnects, recreates topology, and confirms the next DLQ handoff', async () => {
    const manager = (publisher as any).connection;
    const disconnected = once(manager, 'disconnect');
    manager.reconnect();
    await disconnected;
    const body = data();
    await publisher.publishToDlq(body, 3);
    const message = await channel.get(WORKFLOW_DLQ, { noAck: false });
    expect(message).not.toBe(false);
    if (!message) return;
    expect(JSON.parse(message.content.toString()).data).toEqual(body);
    channel.ack(message);
  });
});
