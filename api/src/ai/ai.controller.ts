import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { AskAiDto } from './dto/ask-ai.dto.js';
import { AiService } from './ai.service.js';
import { AiConversationService } from './ai-conversation.service.js';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiConversationService: AiConversationService,
  ) {}

  @Get('conversations')
  async getConversationByWorkflowRun(
    @Query('workflowRunId') workflowRunId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.aiConversationService.getConversationByWorkflowRun(
      workflowRunId,
      user.sub,
    );
  }

  @Get('conversations/:conversationId/messages')
  async getMessages(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.aiConversationService.getMessages(
      conversationId,
      user.sub,
    );
  }

  @Post('ask')
  async ask(
    @Body() dto: AskAiDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.aiService.ask(
      dto.question,
      dto.workflowRunId,
      dto.conversationId,
      user.sub,
      user.organizationId,
    );
  }

  @Post('ask/stream')
  async askStream(
    @Body() dto: AskAiDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    let conversationId = dto.conversationId;

    if (!conversationId) {
      const conversation =
        await this.aiConversationService.createConversation(
          user.sub,
          dto.workflowRunId,
        );

      conversationId = conversation.id;
    } else {
      await this.aiConversationService.getConversation(
        conversationId,
        user.sub,
      );
    }

    await this.aiConversationService.addMessage(
      conversationId,
      user.sub,
      'USER',
      dto.question,
    );

    res.setHeader(
      'Content-Type',
      'text/plain; charset=utf-8',
    );

    res.setHeader(
      'Transfer-Encoding',
      'chunked',
    );

    res.setHeader(
      'Cache-Control',
      'no-cache',
    );

    res.setHeader(
      'Connection',
      'keep-alive',
    );

    res.setHeader(
      'X-Conversation-Id',
      conversationId,
    );

    let assistantAnswer = '';

    try {
      for await (
        const chunk of this.aiService.askStream(
          dto.question,
          dto.workflowRunId,
          conversationId,
          user.sub,
          user.organizationId,
        )
      ) {
        assistantAnswer += chunk;
        res.write(chunk);
      }

      await this.aiConversationService.addMessage(
        conversationId,
        user.sub,
        'ASSISTANT',
        assistantAnswer,
      );

      res.end();
    } catch (error) {
      res.end();
      throw error;
    }
  }
}