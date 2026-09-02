import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrganizationDto } from './dto/create-organization.dto.js';

@Injectable()
export class OrganizationService {
    constructor(private readonly prisma: PrismaService) {}
    async findAll() {
        return this.prisma.organization.findMany();
    }
    findOne(id: string) {
        return this.prisma.organization.findUnique({
            where: { id },
        });
    }
    create(createOrganizationDto: CreateOrganizationDto) {
        return this.prisma.organization.create({
            data: createOrganizationDto,
        });
    }
}
