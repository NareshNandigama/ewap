import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload,  } from '@nestjs/microservices';
import { WorkflowConsumerService } from './workflow-consumer.service.js';

@Controller()
export class WorkflowConsumerController {
    constructor(
        private readonly workflowConsumerService: WorkflowConsumerService        
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

            // Execution failed → NACK + requeue
            channel.nack(message, false, true);
            console.log('🔄 RabbitMQ message NACKed and requeued');
        }
    }
}