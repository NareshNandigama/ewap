import { Controller, Get, Post, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { OrganizationService } from './organization.service.js';
import { CreateOrganizationDto } from './dto/create-organization.dto.js';
import { NotFoundException } from '@nestjs/common';

@Controller('organizations')
export class OrganizationController {
    constructor(private readonly organizationService: OrganizationService) {}
    @Get()
    findAll() {
        return this.organizationService.findAll();
    }

    @Get(':id')
    async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
        const organization = await this.organizationService.findOne(id);
        if (!organization) {
            throw new NotFoundException(`Organization with ID ${id} not found`);
        }
        return organization
    }

    @Post()
    create(@Body() createOrganizationDto: CreateOrganizationDto) {
    return this.organizationService.create(createOrganizationDto);
    }
}
