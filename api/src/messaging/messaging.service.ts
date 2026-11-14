import { Inject, Injectable, Optional, OnModuleDestroy } from '@nestjs/common';
import { ClientProxy, RmqRecordBuilder } from '@nestjs/microservices';
import { firstValueFrom, timeout, type Subscription } from 'rxjs';

@Injectable()
export class MessagingService implements OnModuleDestroy {
  private brokerConnected = false;
  private subscription?: Subscription;
  constructor(
    @Optional()
    @Inject('RABBITMQ_SERVICE')
    private readonly rabbitClient: ClientProxy | undefined,
  ) {
    this.subscription = this.rabbitClient?.status.subscribe((status) => {
      this.brokerConnected = status === 'connected' || status === 'unblocked';
    });
  }

  async onModuleDestroy() {
    this.subscription?.unsubscribe();
    await this.rabbitClient?.close();
  }

  isEnabled(): boolean {
    return !!this.rabbitClient;
  }

  async isReady(): Promise<boolean> {
    if (!this.rabbitClient) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.rabbitClient.connect(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Broker readiness timeout')),
            3000,
          );
        }),
      ]);
      return this.brokerConnected;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async publishWorkflowRun(
    runId: string,
    workflowId: string,
    retryCount = 0,
  ): Promise<void> {
    if (!this.rabbitClient) {
      console.log(
        `⏭️ Messaging disabled. WorkflowRun ${runId} will not be published.`,
      );
      return;
    }

    await firstValueFrom(
      this.rabbitClient
        .emit(
          'workflow.execute',
          new RmqRecordBuilder({ runId, workflowId })
            .setOptions({
              persistent: true,
              headers: { 'x-retry-count': String(retryCount) },
            })
            .build(),
        )
        .pipe(timeout(10000)),
    );
  }
}
