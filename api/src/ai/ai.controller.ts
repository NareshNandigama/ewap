import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { AskAiDto } from './dto/ask-ai.dto.js';
import { AiService } from './ai.service.js';
import { WorkflowDiagnosticsService } from './workflow-diagnostics.service.js';
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
    private readonly workflowDiagnostics: WorkflowDiagnosticsService,
  ) {}

  @Get('conversations')
  async getConversationByWorkflowRun(
    @Query('workflowRunId') workflowRunId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.aiConversationService.getConversationByWorkflowRun(
      workflowRunId,
      user.sub,
      user.organizationId,
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
      user.organizationId,
    );
  }

  // Optional Python diagnostics with the existing TypeScript graph as fallback.
  @Post('agent/diagnose')
  async diagnose(@Body() dto: AskAiDto, @CurrentUser() user: JwtPayload) {
    return this.workflowDiagnostics.diagnose(
      dto.question,
      dto.workflowRunId,
      user.organizationId,
    );
  }

  @Post('ask')
  async ask(@Body() dto: AskAiDto, @CurrentUser() user: JwtPayload) {
    return this.aiService.ask(
      dto.question,
      dto.workflowRunId,
      dto.conversationId,
      user.sub,
      user.organizationId,
    );
  }

  @Post('ask/stream')
  @HttpCode(200)
  async askStream(
    @Body() dto: AskAiDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    let conversationId = dto.conversationId;

    if (!conversationId) {
      const conversation = await this.aiConversationService.createConversation(
        user.sub,
        dto.workflowRunId,
        user.organizationId,
      );

      conversationId = conversation.id;
    } else {
      await this.aiConversationService.getConversation(
        conversationId,
        user.sub,
        user.organizationId,
        dto.workflowRunId,
      );
    }

    await this.aiConversationService.addMessage(
      conversationId,
      user.sub,
      'USER',
      dto.question,
      user.organizationId,
      dto.workflowRunId,
    );

    const assistant = await this.aiConversationService.startAssistant(
      conversationId,
      user.sub,
      user.organizationId,
      dto.workflowRunId,
    );
    const abort = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) abort.abort();
    };
    res.on('close', onClose);
    if (res.destroyed) abort.abort();
    const deadline = setTimeout(
      () => abort.abort(new Error('AI request deadline exceeded')),
      35000,
    );
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Conversation-Id', conversationId);
    const send = async (event: string, data: object) => {
      abort.signal.throwIfAborted();
      if (!res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) {
        // Bound output buffering and stop on disconnect/deadline while waiting for drain.
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            res.off('drain', drain);
            abort.signal.removeEventListener('abort', cancelled);
          };
          const drain = () => {
            cleanup();
            resolve();
          };
          const cancelled = () => {
            cleanup();
            reject(abort.signal.reason);
          };
          res.once('drain', drain);
          abort.signal.addEventListener('abort', cancelled, { once: true });
        });
      }
    };
    let answer = '';
    let state: 'COMPLETED' | 'FAILED' | 'CANCELLED' = 'FAILED';
    try {
      await send('conversation', { conversationId, messageId: assistant.id });
      for await (const chunk of this.aiService.askStream(
        dto.question,
        dto.workflowRunId,
        conversationId,
        user.sub,
        user.organizationId,
        abort.signal,
      )) {
        abort.signal.throwIfAborted();
        answer += chunk;
        await send('delta', { text: chunk });
      }
      abort.signal.throwIfAborted();
      state = 'COMPLETED';
    } catch {
      state = abort.signal.aborted && res.destroyed ? 'CANCELLED' : 'FAILED';
    } finally {
      clearTimeout(deadline);
      res.off('close', onClose);
      try {
        await this.aiConversationService.finishAssistant(
          assistant.id,
          conversationId,
          user.sub,
          user.organizationId,
          dto.workflowRunId,
          answer,
          state,
        );
        if (!res.destroyed)
          res.write(
            `event: terminal\ndata: ${JSON.stringify({ state, messageId: assistant.id })}\n\n`,
          );
      } finally {
        abort.abort();
        if (!res.destroyed) res.end();
      }
    }
  }
}
