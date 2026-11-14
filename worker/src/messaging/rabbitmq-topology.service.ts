import type { ConfirmChannel } from 'amqplib';
import {
  WORKFLOW_EXCHANGE,
  WORKFLOW_RETRY_EXCHANGE,
  WORKFLOW_DLQ_EXCHANGE,
  WORKFLOW_QUEUE,
  WORKFLOW_RETRY_QUEUE,
  WORKFLOW_DLQ,
  RETRY_DELAY_MS,
} from './messaging.constants.js';

export async function setupTopology(channel: ConfirmChannel) {
  await channel.assertExchange(WORKFLOW_EXCHANGE, 'direct', {
    durable: true,
  });

  await channel.assertExchange(WORKFLOW_RETRY_EXCHANGE, 'direct', {
    durable: true,
  });

  await channel.assertExchange(WORKFLOW_DLQ_EXCHANGE, 'direct', {
    durable: true,
  });

  await channel.assertQueue(WORKFLOW_QUEUE, {
    durable: true,
    deadLetterExchange: WORKFLOW_DLQ_EXCHANGE,
    deadLetterRoutingKey: 'workflow.dead',
  });

  await channel.assertQueue(WORKFLOW_RETRY_QUEUE, {
    durable: true,
    messageTtl: RETRY_DELAY_MS,
    deadLetterExchange: WORKFLOW_EXCHANGE,
    deadLetterRoutingKey: 'workflow.execute',
  });

  await channel.assertQueue(WORKFLOW_DLQ, {
    durable: true,
  });

  await channel.bindQueue(
    WORKFLOW_QUEUE,
    WORKFLOW_EXCHANGE,
    'workflow.execute',
  );

  await channel.bindQueue(
    WORKFLOW_RETRY_QUEUE,
    WORKFLOW_RETRY_EXCHANGE,
    'workflow.retry',
  );

  await channel.bindQueue(WORKFLOW_DLQ, WORKFLOW_DLQ_EXCHANGE, 'workflow.dead');
}
