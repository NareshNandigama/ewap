import { describe, it, expect, vi } from 'vitest';
import { analyticsWindow, AnalyticsService } from './analytics.service.js';
import {
  workflowRatesQuery,
  latestRunsQuery,
  integrationErrorsQuery,
} from './analytics.queries.js';
import { AnalyticsController } from './analytics.controller.js';

describe('Analytics', () => {
  it('defaults to a 30-day window and 50 results', () => {
    expect(
      analyticsWindow({} as never, new Date('2026-02-01T00:00:00Z')),
    ).toEqual({
      from: '2026-01-02T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      limit: 50,
    });
  });
  it.each([
    { limit: null },
    { limit: 0 },
    { limit: 201 },
    { limit: 1.5 },
    { limit: '1;SELECT' },
    { from: '2026-01-01' },
    { from: '2026-01-01T00:00:00' },
    { from: '2026-02-30T00:00:00Z' },
    { from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' },
    { from: '2020-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' },
  ])('rejects invalid windows/limits %#', (query) => {
    expect(() => analyticsWindow(query as never)).toThrow();
  });
  it('normalizes timezone offsets to UTC', () => {
    const result = analyticsWindow({
      from: '2026-01-01T05:30:00+05:30',
      to: '2026-02-01T05:30:00+05:30',
      limit: 10,
    });
    expect(result.from).toBe('2026-01-01T00:00:00.000Z');
  });
  it('binds tenant input as a parameter in every query', () => {
    const tenant = "org' OR 1=1 --";
    const window = {
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z',
      limit: 10,
    };
    for (const query of [
      workflowRatesQuery(tenant, window),
      workflowRatesQuery(tenant, window, true),
      latestRunsQuery(tenant, window),
      integrationErrorsQuery(tenant, window),
    ]) {
      expect(query.text).not.toContain(tenant);
      expect(query.values).toContain(tenant);
      expect(query.values).toContain(10);
    }
  });
  it('rejects missing organization context before issuing SQL', async () => {
    const prisma = { $queryRaw: vi.fn() };
    await expect(
      new AnalyticsService(prisma as never).report('rates', '', {} as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('controller forwards only the authenticated organization', async () => {
    const service = { report: vi.fn().mockResolvedValue({ items: [] }) };
    const controller = new AnalyticsController(service as never);
    const user = {
      sub: 'user',
      email: 'test@example.invalid',
      role: 'MEMBER',
      organizationId: 'jwt-org',
    };
    for (const handler of [
      'topFailing',
      'rates',
      'latest',
      'errors',
    ] as const) {
      await controller[handler](
        { organizationId: 'attacker-org' } as never,
        user,
      );
      expect(service.report.mock.lastCall?.[1]).toBe('jwt-org');
    }
  });
});
