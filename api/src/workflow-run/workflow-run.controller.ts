import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { WorkflowRunService } from './workflow-run.service.js';
import { WorkflowStatusDto } from './dto/workflow-status.dto.js';
import { WorkflowGateway } from '../workflow/workflow.gateway.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';
@Controller()
@UseGuards(JwtAuthGuard)
export class WorkflowRunController {
  constructor(
    private readonly workflowRunService: WorkflowRunService,
    private readonly workflowGateway: WorkflowGateway,
  ) {}

  @Get('workflow-runs')
  findAll(@CurrentUser() user: JwtPayload) {
    return this.workflowRunService.findAll(
      user.organizationId,
    );
  }

  @Post('workflows/:workflowId/runs')
  create(
    @Param('workflowId', new ParseUUIDPipe())
    workflowId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workflowRunService.create(
      workflowId,
      user.organizationId,
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
    return this.workflowRunService.findOne(
      id,
      user.organizationId,
    );
  }

  @Post('workflow-runs/status')
  updateStatus(@Body() dto: WorkflowStatusDto) {
    this.workflowGateway.broadcastWorkflowStatus(
      dto.runId,
      dto.status,
    );

    return {
      success: true,
    };
  }
}