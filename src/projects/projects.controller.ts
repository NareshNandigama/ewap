import { Body, Controller, Post } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto.js';

@Controller('projects')
export class ProjectsController {
    @Post()
    createProject(@Body() dto: CreateProjectDto) {
        return dto;
    }
}
