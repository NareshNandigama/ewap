import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload,  } from '@nestjs/microservices';
import { WorkflowConsumerService } from './workflow-consumer.service.js';
import { RabbitMqPublisherService } from '../messaging/rabbitmq-publisher.service.js';
import { MAX_RETRIES } from '../messaging/messaging.constants.js';

@Controller()
export class WorkflowConsumerController {
    constructor(
        private readonly workflowConsumerService: WorkflowConsumerService,
        private readonly rabbitMqPublisherService: RabbitMqPublisherService      
    ) {}
    @EventPattern('workflow.execute')
    async handleWorkflowExecution(
        @Payload()
        data: {
        runId: string;
        workflowId: string;
        },
        @Ctx() context: any
    ) {
        console.log('🔥 Workflow execution received!');
        console.log('Run ID:', data.runId);
        console.log('Workflow ID:', data.workflowId);

        // Workflow execution succeeded.
        // Tell RabbitMQ it is safe to remove this message.
        const channel = context.getChannelRef();
        const message = context.getMessage();

        try {
            await this.workflowConsumerService.executeWorkflow(data.runId);
            channel.ack(message);
            console.log('📨 RabbitMQ message ACKed');
        } catch (error) {
            console.error(
                `❌ WorkflowRun ${data.runId} failed`,
            );

            const retryCount =
                Number(message.properties.headers?.['x-retry-count'] ?? 0);

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

                console.log('📨 Original message ACKed after moving to DLQ');

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
// | Capability                  | Status  |
// | --------------------------- | ------- |
// | Async workflow execution    | ✅       |
// | Worker process              | ✅       |
// | Manual ACK                  | ✅       |
// | Failure handling            | ✅       |
// | Controlled retry            | ✅       |
// | Retry delay                 | ✅ 5 sec |
// | Retry count                 | ✅       |
// | Maximum retries             | ✅ 3     |
// | Dead Letter Queue           | ✅       |
// | Infinite requeue protection | ✅       |
