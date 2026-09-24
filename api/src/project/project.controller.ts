import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CreateProjectDto } from './dto/create-project.dto.js';
import { ProjectService } from './project.service.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles/roles.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
  ) {}

  @Post('organizations/:organizationId/projects')
  @Roles('ADMIN')
  create(
    @Param('organizationId', new ParseUUIDPipe())
    organizationId: string,
    @Body() createProjectDto: CreateProjectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectService.create(
      organizationId,
      user.organizationId,
      createProjectDto,
    );
  }

  @Get('organizations/:organizationId/projects')
  findByOrganization(
    @Param('organizationId', new ParseUUIDPipe())
    organizationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectService.findByOrganization(
      organizationId,
      user.organizationId,
    );
  }

  @Get('projects/:id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectService.findOne(
      id,
      user.organizationId,
    );
  }
}