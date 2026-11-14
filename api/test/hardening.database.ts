import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { analyticsTestClient } from './analytics-test-db.js';
import { AiConversationService } from '../src/ai/ai-conversation.service.js';
import { WorkflowRunService } from '../src/workflow-run/workflow-run.service.js';
import { DispatchOutboxService } from '../src/workflow-run/dispatch-outbox.service.js';
import { StatusOutboxService } from '../../worker/src/workflow-consumer/status-outbox.service.js';
import {
  WorkflowConsumerService,
  ExecutionLeaseLost,
} from '../../worker/src/workflow-consumer/workflow-consumer.service.js';
const db = analyticsTestClient();
const organizationId = randomUUID(),
  workflowId = randomUUID();
const messaging = { isEnabled: () => true, publishWorkflowRun: vi.fn() };
const redis = { isAvailable: () => false };
const service = new WorkflowRunService(
  db as never,
  messaging as never,
  redis as never,
);
class Executor extends WorkflowConsumerService {
  protected async executeSteps() {}
}
beforeAll(async () => {
  await db.$connect();
  await db.organization.create({
    data: {
      id: organizationId,
      name: 'Hardening fixture',
      projects: {
        create: {
          name: 'Fixture',
          workflows: { create: { id: workflowId, name: 'Fixture' } },
        },
      },
    },
  });
});
afterAll(async () => {
  await db.$disconnect();
});
describe('durable dispatch and fenced execution with PostgreSQL', () => {
  it('creates one run/outbox under concurrent idempotent requests', async () => {
    const runs = await Promise.all(
      Array.from({ length: 4 }, () =>
        service.create(workflowId, organizationId, 'same-request'),
      ),
    );
    expect(new Set(runs.map((run) => run.id)).size).toBe(1);
    expect(
      await db.workflowOutbox.count({
        where: { runId: runs[0].id, kind: 'EXECUTE' },
      }),
    ).toBe(1);
  });
  it('rolls back run creation if its durable dispatch insert fails', async () => {
    const before = await db.workflowRun.count({ where: { workflowId } });
    const failing = {
      workflow: db.workflow,
      $transaction: (fn: any) =>
        db.$transaction((tx) =>
          fn({
            workflowRun: tx.workflowRun,
            workflowOutbox: {
              create: () => {
                throw new Error('synthetic outbox failure');
              },
            },
          }),
        ),
    };
    const commands = new WorkflowRunService(
      failing as never,
      messaging as never,
      redis as never,
    );
    await expect(commands.create(workflowId, organizationId)).rejects.toThrow(
      'outbox failure',
    );
    expect(await db.workflowRun.count({ where: { workflowId } })).toBe(before);
  });
  it('leaves intentionally disabled runs undispatched and exposes queued dispatch state', async () => {
    const disabled = new WorkflowRunService(
      db as never,
      { isEnabled: () => false } as never,
      redis as never,
    );
    const run = await disabled.create(workflowId, organizationId);
    expect(await db.workflowOutbox.count({ where: { runId: run.id } })).toBe(0);
    expect(
      (await disabled.findOne(run.id, organizationId)).dispatch.state,
    ).toBe('DISABLED');
    const queued = await service.create(workflowId, organizationId);
    expect(
      (await service.findOne(queued.id, organizationId)).dispatch.state,
    ).toBe('QUEUED');
  });
  it('denies another tenant before writing', async () => {
    await expect(service.create(workflowId, randomUUID())).rejects.toThrow(
      'not found',
    );
  });
  it('retains the outbox after broker failure and delivers on recovery', async () => {
    const run = await service.create(workflowId, organizationId);
    const relay = new DispatchOutboxService(db as never, messaging as never);
    // Prior fixture history is retained; make this test's record the next batch candidate.
    await db.workflowOutbox.update({
      where: { key: `dispatch:${run.id}` },
      data: { createdAt: new Date(0) },
    });
    messaging.publishWorkflowRun.mockRejectedValue(new Error('broker offline'));
    await relay.tick();
    expect(
      (
        await db.workflowOutbox.findUniqueOrThrow({
          where: { key: `dispatch:${run.id}` },
        })
      ).deliveredAt,
    ).toBeNull();
    await db.workflowOutbox.update({
      where: { key: `dispatch:${run.id}` },
      data: { availableAt: new Date(0) },
    });
    messaging.publishWorkflowRun.mockResolvedValue(undefined);
    await relay.tick();
    expect(
      (
        await db.workflowOutbox.findUniqueOrThrow({
          where: { key: `dispatch:${run.id}` },
        })
      ).deliveredAt,
    ).not.toBeNull();
  });
  it('allows one claim for duplicate concurrent deliveries and persists success events', async () => {
    const run = await service.create(workflowId, organizationId);
    const executor = new Executor(db as never);
    const results = await Promise.all([
      executor.executeWorkflow(run.id, 0),
      executor.executeWorkflow(run.id, 0),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      (await db.workflowRun.findUniqueOrThrow({ where: { id: run.id } }))
        .status,
    ).toBe('SUCCESS');
    expect(
      await db.workflowOutbox.count({
        where: { runId: run.id, kind: 'STATUS' },
      }),
    ).toBe(2);
  });
  it('recovers an expired RUNNING claim and fences the old token', async () => {
    const run = await service.create(workflowId, organizationId);
    await db.workflowRun.update({
      where: { id: run.id },
      data: {
        status: 'RUNNING',
        executionToken: 'abandoned',
        leaseExpiresAt: new Date(0),
      },
    });
    const executor = new Executor(db as never);
    await new DispatchOutboxService(db as never, messaging as never).tick();
    expect(
      await db.workflowOutbox.count({
        where: { key: `recover:${run.id}:abandoned` },
      }),
    ).toBe(1);
    await expect(executor.executeWorkflow(run.id, 0)).resolves.toBe(true);
    await expect(
      (executor as any).finish(run.id, 'abandoned', 'FAILED'),
    ).rejects.toBeInstanceOf(ExecutionLeaseLost);
    expect(
      (await db.workflowRun.findUniqueOrThrow({ where: { id: run.id } }))
        .status,
    ).toBe('SUCCESS');
  });
  it('retries status delivery independently without altering a successful execution', async () => {
    const run = await service.create(workflowId, organizationId);
    await new Executor(db as never).executeWorkflow(run.id, 0);
    await db.workflowOutbox.updateMany({
      where: { runId: run.id, kind: 'STATUS' },
      data: { createdAt: new Date(0) },
    });
    const client = { notify: vi.fn().mockResolvedValue(false) };
    const relay = new StatusOutboxService(db as never, client as never);
    await relay.tick();
    expect(
      (await db.workflowRun.findUniqueOrThrow({ where: { id: run.id } }))
        .status,
    ).toBe('SUCCESS');
    expect(
      await db.workflowOutbox.count({
        where: { runId: run.id, kind: 'STATUS', deliveredAt: null },
      }),
    ).toBe(2);
    await db.workflowOutbox.updateMany({
      where: { runId: run.id },
      data: { availableAt: new Date(0) },
    });
    client.notify.mockResolvedValue(true);
    await relay.tick();
    expect(
      await db.workflowOutbox.count({
        where: { runId: run.id, kind: 'STATUS', deliveredAt: null },
      }),
    ).toBe(0);
  });
  it('rolls back a claim when log creation fails', async () => {
    const run = await service.create(workflowId, organizationId);
    const prisma = {
      $transaction: (fn: any) =>
        db.$transaction((tx) =>
          fn({
            workflowRun: tx.workflowRun,
            workflowOutbox: tx.workflowOutbox,
            workflowExecutionLog: {
              create: () => {
                throw new Error('synthetic log write failure');
              },
            },
          }),
        ),
    };
    await expect(
      new Executor(prisma as never).executeWorkflow(run.id, 0),
    ).rejects.toThrow('log write failure');
    expect(
      (await db.workflowRun.findUniqueOrThrow({ where: { id: run.id } }))
        .status,
    ).toBe('PENDING');
  });
});

describe('chat authorization and terminal persistence with PostgreSQL', () => {
  const conversations = new AiConversationService(db as never);
  it('denies cross-tenant, cross-user and same-owner cross-run writes', async () => {
    const user = await db.user.create({
      data: {
        name: 'Chat fixture',
        email: `${randomUUID()}@example.invalid`,
        passwordHash: 'synthetic',
        organizationId,
      },
    });
    const run = await service.create(workflowId, organizationId);
    const otherRun = await service.create(workflowId, organizationId);
    const conversation = await conversations.createConversation(
      user.id,
      run.id,
      organizationId,
    );
    const before = await db.aiMessage.count({
      where: { conversationId: conversation.id },
    });
    await expect(
      conversations.createConversation(user.id, run.id, randomUUID()),
    ).rejects.toThrow('not found');
    await expect(
      conversations.addMessage(
        conversation.id,
        randomUUID(),
        'USER',
        'forged',
        organizationId,
        run.id,
      ),
    ).rejects.toThrow('not found');
    await expect(
      conversations.addMessage(
        conversation.id,
        user.id,
        'USER',
        'wrong run',
        organizationId,
        otherRun.id,
      ),
    ).rejects.toThrow('not found');
    expect(
      await db.aiMessage.count({ where: { conversationId: conversation.id } }),
    ).toBe(before);
    const assistant = await conversations.startAssistant(
      conversation.id,
      user.id,
      organizationId,
      run.id,
    );
    await conversations.finishAssistant(
      assistant.id,
      conversation.id,
      user.id,
      organizationId,
      run.id,
      'partial',
      'CANCELLED',
    );
    expect(
      await db.aiMessage.findUniqueOrThrow({ where: { id: assistant.id } }),
    ).toMatchObject({ content: 'partial', state: 'CANCELLED' });
    await expect(
      conversations.finishAssistant(
        assistant.id,
        conversation.id,
        user.id,
        organizationId,
        run.id,
        'overwrite',
        'COMPLETED',
      ),
    ).rejects.toThrow('not found');
    const abandoned = await conversations.startAssistant(
      conversation.id,
      user.id,
      organizationId,
      run.id,
    );
    await db.aiMessage.update({
      where: { id: abandoned.id },
      data: { createdAt: new Date(Date.now() - 120000) },
    });
    await conversations.getMessages(
      conversation.id,
      user.id,
      organizationId,
      run.id,
    );
    expect(
      (await db.aiMessage.findUniqueOrThrow({ where: { id: abandoned.id } }))
        .state,
    ).toBe('FAILED');
  });
});

describe('live HTTP streaming terminal states', () => {
  let app: import('@nestjs/common').INestApplication,
    origin: string,
    token: string,
    runId: string;
  let mode: 'complete' | 'fail' | 'cancel' = 'complete';
  let observedAbort = false;
  beforeAll(async () => {
    const { Test } = await import('@nestjs/testing');
    const { JwtModule, JwtService } = await import('@nestjs/jwt');
    const { AiController } = await import('../src/ai/ai.controller.js');
    const { AiService } = await import('../src/ai/ai.service.js');
    const { WorkflowDiagnosticsService } =
      await import('../src/ai/workflow-diagnostics.service.js');
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const user = await db.user.create({
      data: {
        organizationId,
        name: 'HTTP chat fixture',
        email: `${randomUUID()}@example.invalid`,
        passwordHash: 'synthetic',
      },
    });
    runId = (await service.create(workflowId, organizationId)).id;
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'synthetic-http-test-key' })],
      controllers: [AiController],
      providers: [
        AiConversationService,
        { provide: PrismaService, useValue: db },
        { provide: WorkflowDiagnosticsService, useValue: {} },
        {
          provide: AiService,
          useValue: {
            async *askStream(
              _q: string,
              _r: string,
              _c: string,
              _u: string,
              _o: string,
              signal: AbortSignal,
            ) {
              yield 'provisional answer';
              if (mode === 'fail') throw new Error('synthetic provider error');
              if (mode === 'cancel')
                await new Promise<void>((_resolve, reject) => {
                  const aborted = () => {
                    observedAbort = true;
                    reject(signal.reason);
                  };
                  if (signal.aborted) aborted();
                  else
                    signal.addEventListener('abort', aborted, { once: true });
                });
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
    token = module
      .get(JwtService)
      .sign({ sub: user.id, organizationId, role: 'MEMBER' });
  });
  afterAll(async () => {
    await app?.close();
  });
  async function request(signal?: AbortSignal, requestedRun = runId) {
    return fetch(`${origin}/ai/ask/stream`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        question: 'Explain this workflow',
        workflowRunId: requestedRun,
      }),
    });
  }
  it('sends a persisted completion frame and saves COMPLETED', async () => {
    mode = 'complete';
    const response = await request();
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('event: terminal');
    expect(text).toContain('COMPLETED');
    const record = await db.aiMessage.findFirstOrThrow({
      where: {
        conversationId: response.headers.get('x-conversation-id')!,
        role: 'ASSISTANT',
      },
    });
    expect(record.state).toBe('COMPLETED');
  });
  it('preserves partial output as FAILED on provider error', async () => {
    mode = 'fail';
    const response = await request();
    expect(await response.text()).toContain('FAILED');
    expect(
      await db.aiMessage.findFirstOrThrow({
        where: {
          conversationId: response.headers.get('x-conversation-id')!,
          role: 'ASSISTANT',
        },
      }),
    ).toMatchObject({ state: 'FAILED', content: 'provisional answer' });
  });
  it('propagates client disconnect and persists CANCELLED', async () => {
    mode = 'cancel';
    const abort = new AbortController(),
      response = await request(abort.signal);
    const reader = response.body!.getReader();
    await reader.read();
    abort.abort();
    await reader.cancel().catch(() => undefined);
    let record;
    for (let i = 0; i < 80; i++) {
      record = await db.aiMessage.findFirst({
        where: {
          conversationId: response.headers.get('x-conversation-id')!,
          role: 'ASSISTANT',
        },
      });
      if (record?.state === 'CANCELLED') break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(observedAbort).toBe(true);
    expect(record?.state).toBe('CANCELLED');
  });
  it('rejects an inaccessible run without creating conversation or messages', async () => {
    const before = await db.aiConversation.count();
    const response = await request(undefined, randomUUID());
    expect(response.status).toBe(404);
    expect(await db.aiConversation.count()).toBe(before);
  });
});
