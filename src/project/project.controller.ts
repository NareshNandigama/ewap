import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { ProjectService } from './project.service.js';

@Controller()
export class ProjectController {
    constructor(private readonly projectServiece: ProjectService) {}
    @Post("organizations/:organizationId/projects")
    create(
            @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
            @Body() createProjectDto: CreateProjectDto) {
        return this.projectServiece.create(organizationId, createProjectDto);
    }

    @Get("organizations/:organizationId/projects")
    findByOrganization(
            @Param('organizationId', new ParseUUIDPipe()) organizationId: string) {
        return this.projectServiece.findByOrganization(organizationId);
    }

    @Get("projects/:id")
    findOne(@Param('id', new ParseUUIDPipe()) id: string) {
        return this.projectServiece.findOne(id);
    }   
}
