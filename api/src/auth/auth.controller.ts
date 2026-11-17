import { RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

import { AuthService } from './auth.service.js';

@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  @Post('demo')
  demoLogin() {
    return this.authService.demoLogin();
  }
}
