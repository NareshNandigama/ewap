import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AiConversationService {
  constructor(private readonly prisma: PrismaService) {}
  private scope(
    userId: string,
    organizationId: string,
    workflowRunId?: string,
  ) {
    return {
      userId,
      user: { organizationId },
      workflowRunId,
      workflowRun: { workflow: { project: { organizationId } } },
    };
  }
  async authorizeRun(
    userId: string,
    organizationId: string,
    workflowRunId: string,
  ) {
    const [user, run] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, organizationId },
        select: { id: true },
      }),
      this.prisma.workflowRun.findFirst({
        where: { id: workflowRunId, workflow: { project: { organizationId } } },
        select: { id: true },
      }),
    ]);
    if (!user || !run) throw new NotFoundException('Workflow run not found');
  }
  async createConversation(
    userId: string,
    workflowRunId: string,
    organizationId: string,
  ) {
    await this.authorizeRun(userId, organizationId, workflowRunId);
    return this.prisma.aiConversation.create({
      data: { userId, workflowRunId },
    });
  }
  async getConversationByWorkflowRun(
    workflowRunId: string,
    userId: string,
    organizationId: string,
  ) {
    await this.authorizeRun(userId, organizationId, workflowRunId);
    return this.prisma.aiConversation.findFirst({
      where: this.scope(userId, organizationId, workflowRunId),
      orderBy: { createdAt: 'desc' },
    });
  }
  async getConversation(
    conversationId: string,
    userId: string,
    organizationId: string,
    workflowRunId?: string,
  ) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: {
        id: conversationId,
        ...this.scope(userId, organizationId, workflowRunId),
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }
  async getMessages(
    conversationId: string,
    userId: string,
    organizationId: string,
    workflowRunId?: string,
  ) {
    await this.getConversation(
      conversationId,
      userId,
      organizationId,
      workflowRunId,
    );
    // Recover display/persistence state for an API process lost mid-stream.
    await this.prisma.aiMessage.updateMany({
      where: {
        conversationId,
        state: 'STREAMING',
        createdAt: { lt: new Date(Date.now() - 60000) },
        conversation: this.scope(userId, organizationId, workflowRunId),
      },
      data: { state: 'FAILED', finishedAt: new Date() },
    });
    // Bound history at the database boundary; return the newest 40 in chronological order.
    const messages = await this.prisma.aiMessage.findMany({
      where: {
        conversationId,
        conversation: this.scope(userId, organizationId, workflowRunId),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 40,
    });
    return messages.reverse();
  }
  async addMessage(
    conversationId: string,
    userId: string,
    role: 'USER' | 'ASSISTANT',
    content: string,
    organizationId: string,
    workflowRunId: string,
  ) {
    await this.getConversation(
      conversationId,
      userId,
      organizationId,
      workflowRunId,
    );
    return this.prisma.aiMessage.create({
      data: { conversationId, role, content },
    });
  }
  async startAssistant(
    conversationId: string,
    userId: string,
    organizationId: string,
    workflowRunId: string,
  ) {
    await this.getConversation(
      conversationId,
      userId,
      organizationId,
      workflowRunId,
    );
    return this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        content: '',
        state: 'STREAMING',
      },
    });
  }
  async finishAssistant(
    id: string,
    conversationId: string,
    userId: string,
    organizationId: string,
    workflowRunId: string,
    content: string,
    state: 'COMPLETED' | 'FAILED' | 'CANCELLED',
  ) {
    const result = await this.prisma.aiMessage.updateMany({
      where: {
        id,
        conversationId,
        state: 'STREAMING',
        conversation: this.scope(userId, organizationId, workflowRunId),
      },
      data: { content, state, finishedAt: new Date() },
    });
    if (!result.count)
      throw new NotFoundException('Active assistant message not found');
  }
}
