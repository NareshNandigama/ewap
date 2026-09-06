import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { WorkflowRunService } from './workflow-run.service.js';
import { WorkflowStatusDto } from './dto/workflow-status.dto.js';
import { WorkflowGateway } from '../workflow/workflow.gateway.js';

@Controller()
export class WorkflowRunController {
  constructor(
    private readonly workflowRunService: WorkflowRunService,
    private readonly workflowGateway: WorkflowGateway,
  ) {}

  @Post('workflows/:workflowId/runs')
  create(
    @Param('workflowId', new ParseUUIDPipe()) workflowId: string,
  ) {
    return this.workflowRunService.create(workflowId);
  }

  @Get('workflows/:workflowId/runs')
  findByWorkflow(
    @Param('workflowId', new ParseUUIDPipe()) workflowId: string,
  ) {
    return this.workflowRunService.findByWorkflow(workflowId);
  }

  @Get('workflow-runs/:id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.workflowRunService.findOne(id);
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