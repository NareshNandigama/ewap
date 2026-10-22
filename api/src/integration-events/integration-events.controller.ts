import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';
import type { CreateIntegrationEventDto, DiagnoseIntegrationDto } from './integration-events.dto.js';
import { IntegrationEventsService } from './integration-events.service.js';
import { IntegrationDiagnosticAgentService } from './integration-diagnostic-agent.service.js';

@Controller('integrations/events')
@UseGuards(JwtAuthGuard)
export class IntegrationEventsController {
  constructor(
    private readonly events: IntegrationEventsService,
    private readonly diagnostics: IntegrationDiagnosticAgentService,
  ) {}

  @Post()
  create(@Body() body: CreateIntegrationEventDto, @CurrentUser() user: JwtPayload) {
    return this.events.create(user.organizationId, body);
  }

  @Get()
  list(@Query('externalRunId') externalRunId: string, @CurrentUser() user: JwtPayload) {
    return this.events.list(user.organizationId, externalRunId);
  }

  @Post('diagnose')
  diagnose(@Body() body: DiagnoseIntegrationDto, @CurrentUser() user: JwtPayload) {
    return this.diagnostics.diagnose(user.organizationId, body?.externalRunId, body?.question);
  }
}
