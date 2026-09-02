import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { CreateWorkflowDto } from './dto/create-workflow.dto.js';
import { WorkflowService } from './workflow.service.js';

@Controller()
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post('projects/:projectId/workflows')
  create(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() createWorkflowDto: CreateWorkflowDto,
  ) {
    return this.workflowService.create(
      projectId,
      createWorkflowDto,
    );
  }

  @Get('projects/:projectId/workflows')
  findByProject(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.workflowService.findByProject(projectId);
  }

  @Get('workflows/:id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.workflowService.findOne(id);
  }
}