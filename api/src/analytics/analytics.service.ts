import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AnalyticsQueryDto } from './analytics-query.dto.js';
import {
  integrationErrorsQuery,
  latestRunsQuery,
  workflowRatesQuery,
  type AnalyticsWindow,
} from './analytics.queries.js';

export function analyticsWindow(
  input: AnalyticsQueryDto,
  now = new Date(),
): AnalyticsWindow {
  const query = plainToInstance(AnalyticsQueryDto, input);
  if (
    validateSync(query).length ||
    !Number.isInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > 200
  )
    throw new BadRequestException('Invalid analytics query');
  const to = query.to ? new Date(query.to) : now;
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 30 * 86400000);
  const duration = to.getTime() - from.getTime();
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 366 * 86400000
  ) {
    throw new BadRequestException(
      'Analytics window must be positive and at most 366 days',
    );
  }
  return { from: from.toISOString(), to: to.toISOString(), limit: query.limit };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(
    kind: 'rates' | 'failures' | 'latest' | 'errors',
    organizationId: string,
    query: AnalyticsQueryDto,
  ) {
    if (typeof organizationId !== 'string' || !organizationId.trim()) {
      throw new ForbiddenException('Organization context required');
    }
    const window = analyticsWindow(query);
    const sql =
      kind === 'errors'
        ? integrationErrorsQuery(organizationId, window)
        : kind === 'latest'
          ? latestRunsQuery(organizationId, window)
          : workflowRatesQuery(organizationId, window, kind === 'failures');
    const items = await this.prisma.$queryRaw<Record<string, unknown>[]>(sql);
    return { ...window, items };
  }
}
