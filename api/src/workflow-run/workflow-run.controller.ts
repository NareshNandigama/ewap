import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { WorkflowRunService } from './workflow-run.service.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';
@Controller()
@UseGuards(JwtAuthGuard)
export class WorkflowRunController {
  constructor(private readonly workflowRunService: WorkflowRunService) {}

  @Get('workflow-runs')
  findAll(@CurrentUser() user: JwtPayload) {
    return this.workflowRunService.findAll(user.organizationId);
  }

  @Post('workflows/:workflowId/runs')
  create(
    @Param('workflowId', new ParseUUIDPipe())
    workflowId: string,
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') requestKey?: string,
  ) {
    return this.workflowRunService.create(
      workflowId,
      user.organizationId,
      requestKey,
    );
  }

  @Get('workflows/:workflowId/runs')
  findByWorkflow(
    @Param('workflowId', new ParseUUIDPipe())
    workflowId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workflowRunService.findByWorkflow(
      workflowId,
      user.organizationId,
    );
  }

  @Get('workflow-runs/:id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workflowRunService.findOne(id, user.organizationId);
  }
}
