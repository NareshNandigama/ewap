import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
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
    ) {
        console.log('🔥 Workflow execution received!');
        console.log('Run ID:', data.runId);
        console.log('Workflow ID:', data.workflowId);
        await this.workflowConsumerService.markRunAsRunning(data.runId);
    }
    
}