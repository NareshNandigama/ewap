import { RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { Test, TestingModule } from '@nestjs/testing';
import { AiController } from './ai.controller.js';
import { JwtService } from '@nestjs/jwt';
import { vi } from 'vitest';
import { AiService } from './ai.service.js';
import { AiConversationService } from './ai-conversation.service.js';
import { WorkflowDiagnosticsService } from './workflow-diagnostics.service.js';
import { GroundedDiagnosticsService } from './grounded-diagnostics.service.js';

describe('AiController', () => {
  let controller: AiController;
  const diagnostics = { diagnose: vi.fn() };
  const grounding = { diagnose: vi.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: AiService, useValue: {} },
        { provide: AiConversationService, useValue: {} },
        { provide: WorkflowDiagnosticsService, useValue: diagnostics },
        { provide: GroundedDiagnosticsService, useValue: grounding },
        { provide: JwtService, useValue: {} },
      ],
    })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiController>(AiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('uses authenticated tenant context instead of body tenant fields', async () => {
    diagnostics.diagnose.mockResolvedValue({
      answer: 'report',
      source: 'python-deterministic',
    });
    const body = {
      question: 'Why failed?',
      workflowRunId: 'run-1',
      organizationId: 'attacker-org',
    };
    await controller.diagnose(body, {
      sub: 'user-1',
      organizationId: 'verified-org',
      role: 'MEMBER',
    });
    expect(diagnostics.diagnose).toHaveBeenCalledWith(
      'Why failed?',
      'run-1',
      'verified-org',
    );
  });

  it('forwards the Gemini multi-agent selection with the authenticated user', async () => {
    const user = {
      sub: 'user-1',
      organizationId: 'verified-org',
      role: 'MEMBER',
    };
    grounding.diagnose.mockResolvedValue({ source: 'gemini-grounded' });
    await expect(
      controller.diagnose(
        {
          question: 'connection timeout',
          workflowRunId: 'run-1',
          retrievalMode: 'keyword',
          groundingProvider: 'gemini',
        },
        user,
      ),
    ).resolves.toEqual({ source: 'gemini-grounded' });
    expect(grounding.diagnose).toHaveBeenCalledWith(
      'connection timeout',
      'run-1',
      user,
      'keyword',
      expect.any(AbortSignal),
      'gemini',
    );
  });
});
