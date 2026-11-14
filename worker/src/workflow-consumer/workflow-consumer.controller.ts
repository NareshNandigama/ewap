import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import {
  WorkflowConsumerService,
  WorkflowExecutionFailed,
} from './workflow-consumer.service.js';
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
    @Payload() data: { runId: string; workflowId: string },
    @Ctx() context: any,
  ) {
    const channel = context.getChannelRef();
    const message = context.getMessage();
    const retryCount = Number(
      message.properties.headers?.['x-retry-count'] ?? 0,
    );
    if (
      !data ||
      ![data.runId, data.workflowId].every(
        (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id),
      ) ||
      !Number.isInteger(retryCount) ||
      retryCount < 0 ||
      retryCount > MAX_RETRIES
    ) {
      // Reject malformed input without routing it into execution.
      channel.nack(message, false, false);
      return;
    }
    try {
      await this.workflowConsumerService.executeWorkflow(
        data.runId,
        retryCount,
      );
      channel.ack(message);
    } catch (error) {
      try {
        if (
          error instanceof WorkflowExecutionFailed &&
          retryCount >= MAX_RETRIES
        )
          await this.rabbitMqPublisherService.publishToDlq(data, retryCount);
        else
          // Infrastructure/lease errors preserve the attempt number. Only a
          // persisted FAILED outcome consumes the workflow retry allowance.
          await this.rabbitMqPublisherService.publishRetry(
            data,
            retryCount + (error instanceof WorkflowExecutionFailed ? 1 : 0),
          );
        channel.ack(message);
      } catch {
        // Keep the original delivery when confirmation/routing/reconnect fails.
        channel.nack(message, false, true);
      }
    }
  }
}
