/** Real NestJS HTTP -> real Python HTTP. Database reads and LLM calls are fixtures. */
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AiController } from '../src/ai/ai.controller.js';
import { AiService } from '../src/ai/ai.service.js';
import { AiConversationService } from '../src/ai/ai-conversation.service.js';
import { AiAgentService } from '../src/ai/ai-agent.service.js';
import { WorkflowRunTool } from '../src/ai/tools/workflow-run.tool.js';
import { PythonDiagnosticsClient } from '../src/ai/python-diagnostics.client.js';
import { WorkflowDiagnosticsService } from '../src/ai/workflow-diagnostics.service.js';
import { WorkflowRunService } from '../src/workflow-run/workflow-run.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MessagingService } from '../src/messaging/messaging.service.js';
import { RedisService } from '../src/redis/redis.service.js';

const pythonUrl = process.env.AI_DIAGNOSTICS_URL;
const serviceKey = process.env.AI_SERVICE_API_KEY;
if (!pythonUrl || !serviceKey) {
  throw new Error(
    'Start the Python service and set AI_DIAGNOSTICS_URL / AI_SERVICE_API_KEY before running test:ai:live',
  );
}

const runId = '00000000-0000-4000-8000-000000000001';
const fixtureRun = {
  _count: { logs: 1 },
  dispatchEnabled: false,
  id: runId,
  status: 'FAILED',
  logs: [
    {
      id: 'fixture-log-1',
      level: 'ERROR',
      message: 'Fixture connection timed out',
      createdAt: new Date('2026-11-12T10:00:00Z'),
    },
  ],
};

describe('Live Python diagnostics boundary (fixture database/model)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwt: JwtService;
  const llm = {
    generate: vi.fn(async () => 'Fixture TypeScript fallback; no model called'),
  };
  const findFirst = vi.fn(async ({ where }) =>
    where.id === runId &&
    where.workflow.project.organizationId === 'fixture-org'
      ? fixtureRun
      : null,
  );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: randomBytes(32).toString('hex') }),
      ],
      controllers: [AiController],
      providers: [
        WorkflowDiagnosticsService,
        PythonDiagnosticsClient,
        WorkflowRunService,
        WorkflowRunTool,
        AiAgentService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            AI_DIAGNOSTICS_URL: pythonUrl,
            AI_SERVICE_API_KEY: serviceKey,
            AI_DIAGNOSTICS_TIMEOUT_MS: 3000,
          }),
        },
        { provide: PrismaService, useValue: { workflowRun: { findFirst } } },
        { provide: MessagingService, useValue: {} },
        { provide: RedisService, useValue: { isAvailable: () => false } },
        { provide: 'LLM_PROVIDER', useValue: llm },
        { provide: AiService, useValue: {} },
        { provide: AiConversationService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    jwt = module.get(JwtService);
    const health = await fetch(new URL('/health', pythonUrl), {
      signal: AbortSignal.timeout(3000),
    });
    expect(health.status).toBe(200);
  });

  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function diagnose(organizationId = 'fixture-org', token?: string) {
    const credential =
      token ??
      (await jwt.signAsync({
        sub: 'fixture-user',
        email: 'fixture@example.invalid',
        role: 'MEMBER',
        organizationId,
      }));
    return fetch(`${baseUrl}/api/v1/ai/agent/diagnose`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: 'Why did this fail?',
        workflowRunId: runId,
        organizationId: 'fixture-org',
      }),
      signal: AbortSignal.timeout(6000),
    });
  }

  it('returns real Python diagnostics through the JWT-protected NestJS endpoint', async () => {
    const response = await diagnose();
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.source).toBe('python-deterministic');
    expect(body.diagnostics.organizationId).toBe('fixture-org');
    expect(body.diagnostics.workflowRunId).toBe(runId);
    expect(body.diagnostics.evidence[0].message).toBe(
      'Fixture connection timed out',
    );
    expect(body.diagnostics.rootCause.status).toBe('undetermined');
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it('rejects an invalid JWT before the database lookup', async () => {
    const response = await diagnose('fixture-org', 'invalid-token');
    expect(response.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it('rejects another tenant even when the request body claims the original tenant', async () => {
    const response = await diagnose('other-org');
    expect(response.status).toBe(404);
    expect(llm.generate).not.toHaveBeenCalled();
    expect(
      findFirst.mock.calls[0][0].where.workflow.project.organizationId,
    ).toBe('other-org');
  });

  it('rejects direct Python calls with missing or incorrect service credentials', async () => {
    for (const headers of [{}, { 'X-EWAP-Service-Key': 'wrong-key' }]) {
      const response = await fetch(
        new URL('/v1/diagnostics/workflow-run', pythonUrl),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            organizationId: 'fixture-org',
            question: 'Why failed?',
            workflowRun: {
              id: runId,
              status: 'FAILED',
              logs: [],
            },
          }),
          signal: AbortSignal.timeout(3000),
        },
      );
      expect(response.status).toBe(401);
    }
  });

  it('uses the actual TypeScript graph after Python rejects a wrong service key', async () => {
    const runs = app.get(WorkflowRunService);
    const wrongKeyClient = new PythonDiagnosticsClient(
      new ConfigService({
        AI_DIAGNOSTICS_URL: pythonUrl,
        AI_SERVICE_API_KEY: 'deliberately-wrong-' + 'x'.repeat(32),
      }),
    );
    const service = new WorkflowDiagnosticsService(
      runs,
      wrongKeyClient,
      app.get(AiAgentService),
    );
    const result = await service.diagnose('Why failed?', runId, 'fixture-org');
    expect(result.source).toBe('typescript');
    expect(result.answer).toContain('no model called');
    expect(llm.generate).toHaveBeenCalledOnce();
  });
});
