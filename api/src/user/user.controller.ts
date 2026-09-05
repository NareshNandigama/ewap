import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { UserService } from './user.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';

@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('organizations/:organizationId/users')
  create(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body() createUserDto: CreateUserDto,
  ) {
    return this.userService.create(organizationId, createUserDto);
  }

  @Get('organizations/:organizationId/users')
  findByOrganization(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    return this.userService.findByOrganization(organizationId);
  }

  @Get('users/:id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.userService.findOne(id);
  }
}