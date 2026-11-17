/** Real PostgreSQL -> NestJS HTTP -> Python HTTP/LangGraph, mocked model transport only. */
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { RunbookModule } from '../src/runbook/runbook.module.js';
import { RunbookService } from '../src/runbook/runbook.service.js';
import { AiController } from '../src/ai/ai.controller.js';
import { AiService } from '../src/ai/ai.service.js';
import { AiConversationService } from '../src/ai/ai-conversation.service.js';
import { WorkflowDiagnosticsService } from '../src/ai/workflow-diagnostics.service.js';
import { GroundedDiagnosticsService } from '../src/ai/grounded-diagnostics.service.js';
import { PythonDiagnosticsClient } from '../src/ai/python-diagnostics.client.js';
import { WorkflowRunService } from '../src/workflow-run/workflow-run.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { MessagingService } from '../src/messaging/messaging.service.js';
import { analyticsTestClient } from './analytics-test-db.js';

const db = analyticsTestClient();
describe('Grounded cross-process diagnostics', () => {
  let child: ChildProcess,
    app: INestApplication,
    base: string,
    runId: string,
    foreignRun: string;
  let actor: { sub: string; organizationId: string; role: string },
    other: typeof actor;
  let token: string, foreignToken: string, runbooks: RunbookService;
  async function post(run = runId, jwt = token, query = 'connection timeout') {
    return fetch(`${base}/ai/agent/diagnose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        question: query,
        workflowRunId: run,
        retrievalMode: 'keyword',
        organizationId: other.organizationId,
        grounding: { passages: [{ content: 'FORGED SOURCE' }] },
      }),
    });
  }
  beforeAll(async () => {
    const key = randomBytes(32).toString('hex'),
      secret = randomBytes(32).toString('hex');
    child = spawn(
      fileURLToPath(
        new URL('../../ai-service/.venv/bin/python', import.meta.url),
      ),
      [
        fileURLToPath(
          new URL('../../ai-service/tests/grounded_server.py', import.meta.url),
        ),
      ],
      {
        env: {
          ...process.env,
          AI_SERVICE_API_KEY: key,
          AI_ANALYSIS_MODE: 'deterministic',
        },
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    const data = await Promise.race([
      once(child.stdout!, 'data'),
      once(child, 'exit').then(() => {
        throw new Error('Python fixture exited');
      }),
    ]);
    const url = JSON.parse(data[0].toString()).url;
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      try {
        healthy = (await fetch(`${url}/health`)).ok;
      } catch {}
      if (healthy) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (!healthy) throw new Error('Python fixture not ready');
    async function fixture() {
      const org = await db.organization.create({
        data: { name: `grounding-${randomUUID()}` },
      });
      const user = await db.user.create({
        data: {
          name: 'fixture',
          email: `${randomUUID()}@example.invalid`,
          passwordHash: 'no-login',
          role: 'ADMIN',
          organizationId: org.id,
        },
      });
      const project = await db.project.create({
        data: { name: 'fixture', organizationId: org.id },
      });
      const workflow = await db.workflow.create({
        data: { name: 'fixture', projectId: project.id },
      });
      const run = await db.workflowRun.create({
        data: {
          workflowId: workflow.id,
          status: 'FAILED',
          logs: {
            create: {
              level: 'ERROR',
              message: 'Connection timed out after retry',
            },
          },
        },
      });
      return {
        actor: { sub: user.id, organizationId: org.id, role: 'ADMIN' },
        runId: run.id,
      };
    }
    const a = await fixture(),
      b = await fixture();
    actor = a.actor;
    other = b.actor;
    runId = a.runId;
    foreignRun = b.runId;
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: secret,
              RATE_LIMIT_ENABLED: false,
              AI_DIAGNOSTICS_URL: url,
              AI_SERVICE_API_KEY: key,
              AI_DIAGNOSTICS_TIMEOUT_MS: 3000,
            }),
          ],
        }),
        JwtModule.register({ secret }),
        RunbookModule,
      ],
      controllers: [AiController],
      providers: [
        GroundedDiagnosticsService,
        PythonDiagnosticsClient,
        WorkflowRunService,
        { provide: PrismaService, useValue: db },
        { provide: RedisService, useValue: { isAvailable: () => false } },
        { provide: MessagingService, useValue: {} },
        { provide: AiService, useValue: {} },
        { provide: AiConversationService, useValue: {} },
        {
          provide: WorkflowDiagnosticsService,
          useValue: {
            diagnose: () => {
              throw new Error('Ungrounded fallback forbidden');
            },
          },
        },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    const jwt = module.get(JwtService);
    token = jwt.sign(actor);
    foreignToken = jwt.sign(other);
    runbooks = module.get(RunbookService);
    await runbooks.put(
      'timeout',
      {
        title: 'Timeout',
        content: 'Connection timeout: inspect worker connectivity.',
        expectedVersion: 0,
      },
      actor,
    );
    await runbooks.put(
      'foreign',
      {
        title: 'Foreign',
        content: 'Connection timeout FOREIGN TENANT PRIVATE GUIDE',
        expectedVersion: 0,
      },
      other,
    );
  });
  afterAll(async () => {
    if (app) await app.close();
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    const ids = [actor?.organizationId, other?.organizationId].filter(Boolean);
    await db.workflowRun.deleteMany({
      where: { workflow: { project: { organizationId: { in: ids } } } },
    });
    await db.workflow.deleteMany({
      where: { project: { organizationId: { in: ids } } },
    });
    await db.project.deleteMany({ where: { organizationId: { in: ids } } });
    await db.user.deleteMany({ where: { organizationId: { in: ids } } });
    await db.organization.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  it('combines authorized database evidence and immutable runbook provenance through real Python HTTP', async () => {
    const response = await post();
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.source).toBe('python-grounded');
    expect(result.diagnostics.grounding.status).toBe('supported_observations');
    expect(result.diagnostics.grounding.passages).toHaveLength(1);
    expect(result.diagnostics.grounding.passages[0]).toMatchObject({
      sourceKey: 'timeout',
      version: 1,
    });
    expect(result.answer).toContain('Connection timed out after retry');
    expect(result.answer).not.toContain('FOREIGN');
    expect(result.answer).not.toContain('FORGED');
    expect(result.diagnostics.rootCause.status).toBe('undetermined');
  });
  it('rejects cross-tenant runs before retrieval or model work', async () => {
    expect((await post(foreignRun)).status).toBe(404);
    expect((await post(runId, foreignToken)).status).toBe(404);
  });
  it('abstains when retrieval is empty and preserves changed source versions', async () => {
    const missing = await (await post(runId, token, 'nonexistentzebra')).json();
    expect(missing.diagnostics.grounding.status).toBe('insufficient_evidence');
    expect(missing.diagnostics.usage).toBeUndefined();
    await runbooks.put(
      'timeout',
      {
        title: 'Timeout',
        content: 'Connection timeout: inspect the current worker route.',
        expectedVersion: 1,
      },
      actor,
    );
    const current = await (await post()).json();
    expect(current.diagnostics.grounding.passages[0].version).toBe(2);
    await runbooks.remove('timeout', 2, actor);
    const deleted = await (await post()).json();
    expect(deleted.diagnostics.grounding.status).toBe('insufficient_evidence');
  });
  it('rejects missing/revoked identities', async () => {
    expect((await post(runId, 'bad-token')).status).toBe(401);
    await db.user.delete({ where: { id: actor.sub } });
    expect((await post()).status).toBe(403);
  });
});
