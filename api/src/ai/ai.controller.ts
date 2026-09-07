import { Body, Controller, Post } from '@nestjs/common';

import { AskAiDto } from './dto/ask-ai.dto.js';
import { AiService } from './ai.service.js';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('ask')
  async ask(@Body() dto: AskAiDto) {
    return this.aiService.ask(dto.question);
  }
}