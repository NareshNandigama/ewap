import { Controller } from '@nestjs/common';
import {
  Ctx,
  EventPattern,
  Payload,
} from '@nestjs/microservices';

import { WorkflowConsumerService } from './workflow-consumer.service.js';
import { RabbitMqPublisherService } from '../messaging/rabbitmq-publisher.service.js';
import { MAX_RETRIES } from '../messaging/messaging.constants.js';

@Controller()
export class WorkflowConsumerController {
  constructor(
    private readonly workflowConsumerService: WorkflowConsumerService,
    private readonly rabbitMqPublisherService: RabbitMqPublisherService,
  ) {}

  @EventPattern('workflow.execute')
  async handleWorkflowExecution(
    @Payload()
    data: {
      runId: string;
      workflowId: string;
    },
    @Ctx() context: any,
  ) {
    console.log('🔥 Workflow execution received!');
    console.log('Run ID:', data.runId);
    console.log('Workflow ID:', data.workflowId);

    const channel = context.getChannelRef();
    const message = context.getMessage();

    const retryCount = Number(
      message.properties.headers?.['x-retry-count'] ?? 0,
    );

    try {
      const executed =
        await this.workflowConsumerService.executeWorkflow(
          data.runId,
          retryCount,
        );

      // Duplicate delivery.
      // The workflow was already processed, so do not execute it again.
      if (!executed) {
        console.log(
          '⏭️ Duplicate message detected. ACKing without re-execution.',
        );

        channel.ack(message);
        return;
      }

      // Workflow execution completed successfully.
      channel.ack(message);

      console.log('📨 RabbitMQ message ACKed');
    } catch (error) {
      console.error(
        `❌ WorkflowRun ${data.runId} failed`,
      );

      console.log(
        `🔁 Current retry count: ${retryCount}`,
      );

      if (retryCount >= MAX_RETRIES) {
        console.log(
          `☠️ Max retries reached. Sending WorkflowRun ${data.runId} to DLQ.`,
        );

        await this.rabbitMqPublisherService.publishToDlq(
          {
            runId: data.runId,
            workflowId: data.workflowId,
          },
          retryCount,
        );

        channel.ack(message);

        console.log(
          '📨 Original message ACKed after moving to DLQ',
        );

        return;
      }

      await this.rabbitMqPublisherService.publishRetry(
        {
          runId: data.runId,
          workflowId: data.workflowId,
        },
        retryCount + 1,
      );

      channel.ack(message);

      console.log('📨 Original message ACKed');
    }
  }
}