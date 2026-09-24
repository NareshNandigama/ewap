import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CreateWorkflowDto } from './dto/create-workflow.dto.js';
import { WorkflowService } from './workflow.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';
// import { Roles } from '../auth/decorators/roles.decorator.js';
// import { RolesGuard } from '../auth/guards/roles/roles.guard.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}
 
  @Get('workflows')
  findAll(@CurrentUser() user: JwtPayload) {
    return this.workflowService.findAll(
      user.organizationId,
    );
  }


  @Post('projects/:projectId/workflows')
  create(
    @Body() createWorkflowDto: CreateWorkflowDto,
    @CurrentUser() user: JwtPayload,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.workflowService.create(
      projectId,
      createWorkflowDto,
      user.organizationId,
    );
  }

  @Get('projects/:projectId/workflows')
  findByProject(
    @Param('projectId', new ParseUUIDPipe())
    projectId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workflowService.findByProject(
      projectId,
      user.organizationId,
    );
  }

  @Get('workflows/:id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workflowService.findOne(
      id,
      user.organizationId,
    );
  }
}