import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';
import { AnalyticsQueryDto } from './analytics-query.dto.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('workflows/top-failing')
  topFailing(
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analytics.report('failures', user.organizationId, query);
  }

  @Get('workflows/rates')
  rates(@Query() query: AnalyticsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.analytics.report('rates', user.organizationId, query);
  }

  @Get('workflows/latest-runs')
  latest(@Query() query: AnalyticsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.analytics.report('latest', user.organizationId, query);
  }

  @Get('integrations/errors')
  errors(@Query() query: AnalyticsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.analytics.report('errors', user.organizationId, query);
  }
}
