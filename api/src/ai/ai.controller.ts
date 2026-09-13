import {
  Body,
  Controller,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { AskAiDto } from './dto/ask-ai.dto.js';
import { AiService } from './ai.service.js';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('ask')
  async ask(@Body() dto: AskAiDto) {
    return this.aiService.ask(dto.question);
  }

  @Post('ask/stream')
  async askStream(
    @Body() dto: AskAiDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (
      const chunk of this.aiService.askStream(dto.question)
    ) {
      res.write(chunk);
    }

    res.end();
  }
}