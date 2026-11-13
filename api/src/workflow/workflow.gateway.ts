import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';

export const workflowRoom = (organizationId: string) =>
  `org:${organizationId}:workflow-updates`;

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL } })
export class WorkflowGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        const token: unknown = socket.handshake.auth?.token;
        if (typeof token !== 'string' || !token || token.length > 8192)
          throw new Error('Invalid token');
        const claims = await this.jwt.verifyAsync(token);
        if (
          !claims ||
          typeof claims.sub !== 'string' ||
          !claims.sub.trim() ||
          typeof claims.organizationId !== 'string' ||
          !claims.organizationId.trim() ||
          !['ADMIN', 'MEMBER'].includes(claims.role) ||
          !Number.isInteger(claims.exp) ||
          claims.exp * 1000 <= Date.now()
        )
          throw new Error('Invalid identity');
        const user = await this.prisma.user.findFirst({
          where: { id: claims.sub, organizationId: claims.organizationId },
          select: { id: true },
        });
        if (!user) throw new Error('Invalid membership');
        socket.data.identity = {
          organizationId: claims.organizationId,
          expiresAt: claims.exp * 1000,
        };
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });
  }

  async handleConnection(socket: Socket) {
    const identity = socket.data.identity;
    if (!identity || identity.expiresAt <= Date.now()) {
      socket.disconnect(true);
      return;
    }
    try {
      await socket.join(workflowRoom(identity.organizationId));
      if (!socket.connected || identity.expiresAt <= Date.now()) {
        socket.disconnect(true);
        return;
      }
      // Long-lived sockets must not keep receiving after their JWT expires.
      socket.data.expiryTimer = setTimeout(
        () => socket.disconnect(true),
        Math.min(identity.expiresAt - Date.now(), 2147483647),
      );
      socket.emit('workflow.updates.ready');
    } catch {
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    if (socket.data.expiryTimer) clearTimeout(socket.data.expiryTimer);
  }

  broadcastWorkflowStatus(
    organizationId: string,
    runId: string,
    status: string,
  ) {
    this.server
      .to(workflowRoom(organizationId))
      .emit('workflow.status.changed', { runId, status });
  }
}
