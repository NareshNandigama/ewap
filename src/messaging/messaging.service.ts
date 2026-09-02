import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class MessagingService {
  constructor(
    @Inject('RABBITMQ_SERVICE')
    private readonly rabbitClient: ClientProxy,
  ) {}

  async publishWorkflowRun(
    runId: string,
    workflowId: string,
  ): Promise<void> {
    await firstValueFrom(
      this.rabbitClient.emit('workflow.execute', {
        runId,
        workflowId,
      }),
    );
  }
}