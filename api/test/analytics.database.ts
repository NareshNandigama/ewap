import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { randomUUID, randomBytes } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { AnalyticsController } from '../src/analytics/analytics.controller.js';
import { AnalyticsService } from '../src/analytics/analytics.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { analyticsTestClient } from './analytics-test-db.js';

const db = analyticsTestClient();
const org = randomUUID(),
  otherOrg = randomUUID();
const workflows = Array.from({ length: 5 }, (_, i) => `${i}-${randomUUID()}`);
const otherWorkflow = randomUUID();
const window = { from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' };

describe('PostgreSQL analytics and authenticated HTTP endpoints', () => {
  let app: INestApplication,
    url: string,
    jwt: JwtService,
    service: AnalyticsService;
  beforeAll(async () => {
    await db.$connect();
    for (const [id, ids] of [
      [org, workflows],
      [otherOrg, [otherWorkflow]],
    ] as const) {
      await db.organization.create({
        data: {
          id,
          name: 'Analytics test organization',
          projects: {
            create: {
              name: 'Analytics fixture',
              workflows: {
                create: ids.map((workflowId) => ({
                  id: workflowId,
                  name: 'Workflow',
                })),
              },
            },
          },
        },
      });
    }
    const run = (
      workflowId: string,
      status: 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'PENDING' | 'RUNNING',
      day: string,
      suffix = randomUUID(),
    ) => ({
      id: `${org}-${suffix}`,
      workflowId,
      status,
      createdAt: new Date(day),
    });
    await db.workflowRun.createMany({
      data: [
        run(workflows[0], 'SUCCESS', window.from),
        run(workflows[0], 'SUCCESS', '2026-01-02T00:00:00Z'),
        run(workflows[0], 'FAILED', '2026-01-20T00:00:00Z', 'tie-a'),
        run(workflows[0], 'FAILED', '2026-01-20T00:00:00Z', 'tie-b'),
        run(workflows[0], 'CANCELLED', '2026-01-15T00:00:00Z'),
        run(workflows[0], 'PENDING', '2026-01-05T00:00:00Z'),
        run(workflows[0], 'RUNNING', '2026-01-06T00:00:00Z'),
        run(workflows[0], 'FAILED', window.to),
        run(workflows[0], 'FAILED', '2025-12-31T23:59:59Z'),
        run(workflows[1], 'SUCCESS', '2026-01-01T00:00:00Z'),
        run(workflows[1], 'SUCCESS', '2026-01-02T00:00:00Z'),
        run(workflows[1], 'FAILED', '2026-01-03T00:00:00Z'),
        run(workflows[2], 'CANCELLED', '2026-01-01T00:00:00Z'),
        run(workflows[4], 'FAILED', '2025-12-31T00:00:00Z'),
        run(otherWorkflow, 'FAILED', '2026-01-20T00:00:00Z'),
      ],
    });
    for (const organizationId of [org, otherOrg]) {
      await db.integrationEvent.createMany({
        data: [
          ...['TIMEOUT', 'TIMEOUT', null, 'UNSPECIFIED'].map((errorCode) => ({
            status: 'FAILED' as const,
            errorCode,
          })),
          { status: 'SUCCESS' as const, errorCode: null },
          { status: 'RETRYING' as const, errorCode: 'TIMEOUT' },
        ].map((event) => ({
          ...event,
          organizationId,
          integration: 'github',
          workflow: 'fixture',
          externalRunId: 'shared-external-run',
          idempotencyKey: randomUUID(),
          occurredAt: new Date('2026-01-10T00:00:00Z'),
        })),
      });
    }
    // The exact upper boundary must not enter integration event frequencies.
    await db.integrationEvent.create({
      data: {
        organizationId: org,
        integration: 'github',
        workflow: 'fixture',
        externalRunId: 'shared-external-run',
        idempotencyKey: randomUUID(),
        status: 'FAILED',
        errorCode: 'EXCLUDED',
        occurredAt: new Date(window.to),
      },
    });
    const module = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: randomBytes(32).toString('hex') }),
      ],
      controllers: [AnalyticsController],
      providers: [AnalyticsService, { provide: PrismaService, useValue: db }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
    jwt = module.get(JwtService);
    service = module.get(AnalyticsService);
  });
  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });

  it('counts every status but uses SUCCESS + FAILED for outcome rates', async () => {
    const { items } = await service.report('rates', org, {
      ...window,
      limit: 200,
    });
    expect(items).toHaveLength(5);
    expect(
      items.find((item) => item.workflowId === workflows[0]),
    ).toMatchObject({
      totalRuns: 7,
      completedRuns: 4,
      successCount: 2,
      failureCount: 2,
      activeCount: 2,
      cancelledCount: 1,
      successRate: 50,
      failureRate: 50,
    });
    expect(
      items.find((item) => item.workflowId === workflows[1]),
    ).toMatchObject({ successRate: 66.67, failureRate: 33.33 });
  });
  it('returns null rates for no completed runs and includes workflows with no runs', async () => {
    const { items } = await service.report('rates', org, {
      ...window,
      limit: 200,
    });
    for (const workflowId of workflows.slice(2)) {
      expect(
        items.find((item) => item.workflowId === workflowId),
      ).toMatchObject({
        completedRuns: 0,
        successRate: null,
        failureRate: null,
      });
    }
  });
  it('ranks failures without including other tenants or outside-window runs', async () => {
    const { items } = await service.report('failures', org, {
      ...window,
      limit: 200,
    });
    expect(items.map((item) => item.workflowId)).toEqual(workflows.slice(0, 2));
    expect(items.map((item) => item.failureCount)).toEqual([2, 1]);
  });
  it('selects the latest run with a deterministic ID tie-break and null for no matching run', async () => {
    const { items } = await service.report('latest', org, {
      ...window,
      limit: 200,
    });
    expect(items.find((item) => item.workflowId === workflows[0])?.runId).toBe(
      `${org}-tie-b`,
    );
    expect(
      items.find((item) => item.workflowId === workflows[3])?.runId,
    ).toBeNull();
    expect(
      items.find((item) => item.workflowId === workflows[4])?.runId,
    ).toBeNull();
  });
  it('aggregates failed events by integration/code and keeps missing codes distinct', async () => {
    const { items } = await service.report('errors', org, {
      ...window,
      limit: 200,
    });
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      integration: 'github',
      errorCode: 'TIMEOUT',
      failureCount: 2,
      totalEvents: 6,
      frequencyPercent: 33.33,
    });
    expect(items.some((item) => item.errorCode === null)).toBe(true);
    expect(items.some((item) => item.errorCode === 'UNSPECIFIED')).toBe(true);
  });
  it('returns empty items for an unknown tenant and an injection-shaped tenant', async () => {
    for (const tenant of [randomUUID(), "' OR 1=1 --"]) {
      for (const kind of ['rates', 'failures', 'latest', 'errors'] as const) {
        expect(
          (await service.report(kind, tenant, { ...window, limit: 200 })).items,
        ).toEqual([]);
      }
    }
  });
  it('enforces result limits', async () => {
    expect(
      (await service.report('rates', org, { ...window, limit: 1 })).items,
    ).toHaveLength(1);
  });

  async function get(
    path: string,
    organizationId = org,
    token?: string,
    query: Record<string, string> = window,
  ) {
    const credential =
      token ??
      (await jwt.signAsync({
        sub: 'fixture-user',
        organizationId,
        role: 'MEMBER',
      }));
    return fetch(
      `${url}/api/v1/analytics/${path}?${new URLSearchParams(query)}`,
      {
        headers: { Authorization: `Bearer ${credential}` },
        signal: AbortSignal.timeout(5000),
      },
    );
  }
  it.each([
    'workflows/rates',
    'workflows/top-failing',
    'workflows/latest-runs',
    'integrations/errors',
  ])('protects and executes HTTP %s', async (path) => {
    expect((await get(path, org, 'invalid')).status).toBe(401);
    const response = await get(path);
    expect(response.status).toBe(200);
    expect((await response.json()).items.length).toBeGreaterThan(0);
  });
  it('ignores query tenant spoofing and scopes the SQL to the JWT tenant', async () => {
    const response = await get('workflows/rates', otherOrg, undefined, {
      ...window,
      organizationId: org,
    });
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].workflowId).toBe(otherWorkflow);
  });
  it.each([
    { limit: '201' },
    { from: '2026-01-01' },
    { from: window.to, to: window.from },
  ])('rejects invalid HTTP query %#', async (query) => {
    expect(
      (await get('workflows/rates', org, undefined, { ...window, ...query }))
        .status,
    ).toBe(400);
  });
});
