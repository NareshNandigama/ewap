import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('ready')
  ready() {
    return this.healthService.readiness();
  }

  @Get()
  getHealth() {
    return this.healthService.getHealth();
  }
}
