import type { Response } from 'express';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { RunbookRetrievalService } from './runbook-retrieval.service.js';
import { SearchRunbooksDto } from './search-runbooks.dto.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Put,
  Post,
  Res,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';
import { PutRunbookDto } from './runbook.dto.js';
import { RunbookService } from './runbook.service.js';

@Controller('runbooks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RunbookController {
  constructor(
    private readonly runbooks: RunbookService,
    private readonly retrieval: RunbookRetrievalService,
  ) {}

  private async cancellable<T>(
    res: Response,
    work: (signal: AbortSignal) => Promise<T>,
  ) {
    const controller = new AbortController();
    const close = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', close);
    if (res.destroyed) controller.abort();
    try {
      return await work(controller.signal);
    } finally {
      res.off('close', close);
    }
  }

  @Post('search')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  search(
    @Body() input: SearchRunbooksDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cancellable(res, (signal) =>
      this.retrieval.search(input, user, signal),
    );
  }

  @Post(':sourceKey/index')
  @Roles('ADMIN')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  index(
    @Param('sourceKey') key: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cancellable(res, (signal) =>
      this.retrieval.index(key, user, signal),
    );
  }

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query('after') after?: string) {
    return this.runbooks.list(user, after);
  }

  @Get(':sourceKey')
  get(@Param('sourceKey') key: string, @CurrentUser() user: JwtPayload) {
    return this.runbooks.get(key, user);
  }

  @Get(':sourceKey/versions/:version')
  revision(
    @Param('sourceKey') key: string,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.runbooks.get(key, user, version);
  }

  @Put(':sourceKey')
  @Roles('ADMIN')
  put(
    @Param('sourceKey') key: string,
    @Body() input: PutRunbookDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.runbooks.put(key, input, user);
  }

  @Delete(':sourceKey')
  @Roles('ADMIN')
  @HttpCode(204)
  remove(
    @Param('sourceKey') key: string,
    @Query('expectedVersion', ParseIntPipe) expectedVersion: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.runbooks.remove(key, expectedVersion, user);
  }
}
