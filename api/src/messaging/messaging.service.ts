import { Inject, Injectable, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class MessagingService {
  constructor(
    @Optional()
    @Inject('RABBITMQ_SERVICE')
    private readonly rabbitClient: ClientProxy | undefined,
  ) {}

  async publishWorkflowRun(
    runId: string,
    workflowId: string,
  ): Promise<void> {
    if (!this.rabbitClient) {
      console.log(
        `⏭️ Messaging disabled. WorkflowRun ${runId} will not be published.`,
      );
      return;
    }

    await firstValueFrom(
      this.rabbitClient.emit('workflow.execute', {
        runId,
        workflowId,
      }),
    );
  }
}