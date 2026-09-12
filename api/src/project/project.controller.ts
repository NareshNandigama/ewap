import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { ProjectService } from './project.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles/roles.guard.js';
@Controller()
export class ProjectController {
    constructor(private readonly projectServiece: ProjectService) {}
    
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @Post("organizations/:organizationId/projects")
    create(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body() createProjectDto: CreateProjectDto,
    ) {
    return this.projectServiece.create(
        organizationId,
        createProjectDto,
    );
    }

    @Get("organizations/:organizationId/projects")
    findByOrganization(
            @Param('organizationId', new ParseUUIDPipe()) organizationId: string) {
        return this.projectServiece.findByOrganization(organizationId);
    }

    @UseGuards(JwtAuthGuard)
    @Get("projects/:id")
    findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
    ) {
    return this.projectServiece.findOne(
        id,
        user.organizationId,
    )}
}
