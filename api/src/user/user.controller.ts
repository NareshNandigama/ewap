import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('organizations/:organizationId/users')
  @Roles('ADMIN')
  create(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body() dto: CreateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.userService.create(organizationId, dto, user);
  }

  @Get('organizations/:organizationId/users')
  @Roles('ADMIN')
  findByOrganization(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.userService.findByOrganization(organizationId, user);
  }

  @Get('users/:id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.userService.findOne(id, user);
  }
}
