import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import request from 'supertest';
import { AiController } from '../ai/ai.controller.js';
import { AiService } from '../ai/ai.service.js';
import { AiConversationService } from '../ai/ai-conversation.service.js';
import { WorkflowDiagnosticsService } from '../ai/workflow-diagnostics.service.js';
import { AuthController } from '../auth/auth.controller.js';
import { AuthService } from '../auth/auth.service.js';
import { RedisService } from '../redis/redis.service.js';

it('enforces actual HTTP routes before auth writes/provider calls and after JWT authentication', async () => {
  const consumeRateLimit = vi.fn().mockResolvedValue(0);
  const diagnose = vi.fn().mockResolvedValue({ answer: 'ok' });
  const register = vi.fn().mockResolvedValue({ ok: true });
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: 'test-only-secret' })],
    controllers: [AiController, AuthController],
    providers: [
      { provide: ConfigService, useValue: new ConfigService() },
      { provide: RedisService, useValue: { consumeRateLimit } },
      { provide: AiService, useValue: {} },
      { provide: AiConversationService, useValue: {} },
      { provide: WorkflowDiagnosticsService, useValue: { diagnose } },
      { provide: AuthService, useValue: { register } },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  await app.init();
  try {
    const server = app.getHttpServer();
    await request(server).post('/ai/agent/diagnose').send({}).expect(401);
    expect(consumeRateLimit).not.toHaveBeenCalled();
    const token = module
      .get(JwtService)
      .sign({ sub: 'user', organizationId: 'tenant', role: 'MEMBER' });
    await request(server)
      .post('/ai/agent/diagnose')
      .auth(token, { type: 'bearer' })
      .send({ question: 'why', workflowRunId: 'run' })
      .expect(201);
    expect(diagnose).toHaveBeenCalledOnce();
    consumeRateLimit.mockResolvedValue(1100);
    const blocked = await request(server)
      .post('/ai/ask/stream')
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(429);
    expect(blocked.headers['retry-after']).toBe('2');
    await request(server).post('/auth/register').send({}).expect(429);
    expect(register).not.toHaveBeenCalled();
    consumeRateLimit.mockRejectedValue(new Error('offline'));
    await request(server).post('/auth/register').send({}).expect(503);
    expect(register).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
