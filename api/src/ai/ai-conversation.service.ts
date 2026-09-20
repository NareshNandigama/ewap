import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AiConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async createConversation(
    userId: string,
    workflowRunId: string,
  ) {
    return this.prisma.aiConversation.create({
      data: {
        userId,
        workflowRunId,
      },
    });
  }

  async getConversation(
    conversationId: string,
    userId: string,
  ) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: {
        id: conversationId,
        userId,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async getMessages(
    conversationId: string,
    userId: string,
  ) {
    await this.getConversation(conversationId, userId);

    return this.prisma.aiMessage.findMany({
      where: {
        conversationId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async addMessage(
    conversationId: string,
    userId: string,
    role: 'USER' | 'ASSISTANT',
    content: string,
  ) {
    await this.getConversation(conversationId, userId);

    return this.prisma.aiMessage.create({
      data: {
        conversationId,
        role,
        content,
      },
    });
  }
}