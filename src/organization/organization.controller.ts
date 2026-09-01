import { Controller, Get } from '@nestjs/common';
import { OrganizationService } from './organization.service.js';

@Controller('organizations')
export class OrganizationController {
    constructor(private readonly organizationService: OrganizationService) {}
    @Get()
    findAll() {
        return this.organizationService.findAll();
    }
}
