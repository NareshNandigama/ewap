import {
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';

@WebSocketGateway()
export class WorkflowGateway {
  @SubscribeMessage('message')
  handleMessage(client: any, payload: any) {
    console.log('📨 Received from client:', payload);

    client.emit('workflow.status.changed', {
      status: 'RUNNING',
      message: 'Workflow execution started',
    });
  }
}