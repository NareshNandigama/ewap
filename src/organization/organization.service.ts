import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OrganizationService {
    constructor(private readonly prisma: PrismaService) {}
    async findAll() {
        return this.prisma.organization.findMany();
    }
}
