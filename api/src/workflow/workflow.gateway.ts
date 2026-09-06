import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3001',
  },
})
export class WorkflowGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('message')
  handleMessage(client: any, payload: any) {
    console.log('📨 Received from client:', payload);
  }

  broadcastWorkflowStatus(
    runId: string,
    status: string,
  ) {
    console.log(
      `📡 Broadcasting workflow status: ${runId} → ${status}`,
    );

    this.server.emit('workflow.status.changed', {
      runId,
      status,
    });
  }
}