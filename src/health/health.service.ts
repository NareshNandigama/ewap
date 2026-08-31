import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HealthService {
    constructor(private readonly configService: ConfigService) {}
  getHealth() {
    return {
      status: 'ok',
      service: this.configService.get<string>('APP_NAME'),
      version: this.configService.get<string>('APP_VERSION')
    };
  }
}