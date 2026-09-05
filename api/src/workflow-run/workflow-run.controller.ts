import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { WorkflowRunService } from './workflow-run.service.js';

@Controller()
export class WorkflowRunController {
  constructor(
    private readonly workflowRunService: WorkflowRunService,
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
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.workflowRunService.findOne(id);
  }
}