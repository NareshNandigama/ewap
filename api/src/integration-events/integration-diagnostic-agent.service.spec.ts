import { describe, expect, it, vi } from 'vitest';

import { IntegrationDiagnosticAgentService } from './integration-diagnostic-agent.service.js';

describe('IntegrationDiagnosticAgentService', () => {
  const createService = (redisOverrides: Record<string, unknown> = {}) => {
    const events = { list: vi.fn().mockResolvedValue([]) };
    const llm = { generate: vi.fn() };
    const redis = {
      isAvailable: vi.fn(() => true),
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(true),
      ...redisOverrides,
    };
    const service = new IntegrationDiagnosticAgentService(
      events as any,
      llm as any,
      redis as any,
    );

    (service as any).graph = { invoke: vi.fn() };

    return { service, events, llm, redis };
  };

  it('returns a cached diagnosis for the same org, run, and question', async () => {
    const { service, redis } = createService();
    redis.get.mockResolvedValue({ answer: 'cached answer' });

    await expect(
      service.diagnose('org-1', 'run-123', 'Why did this fail?'),
    ).resolves.toEqual({ answer: 'cached answer' });

    expect((service as any).graph.invoke).not.toHaveBeenCalled();
  });

  it('caches a fresh diagnosis result for 300 seconds on a miss', async () => {
    const { service, redis } = createService();
    redis.get.mockResolvedValue(null);
    (service as any).graph.invoke.mockResolvedValue({ answer: 'fresh answer' });

    await expect(
      service.diagnose('org-1', 'run-123', 'Why did this fail?'),
    ).resolves.toEqual({ answer: 'fresh answer' });

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('org:org-1:integration-diagnostics:run-123:'),
      { answer: 'fresh answer' },
      300,
    );
  });

  it('falls back to the LLM graph when Redis is unavailable', async () => {
    const { service, redis } = createService({
      isAvailable: vi.fn(() => false),
    });
    (service as any).graph.invoke.mockResolvedValue({ answer: 'llm answer' });

    await expect(
      service.diagnose('org-2', 'run-456', 'What is the root cause?'),
    ).resolves.toEqual({ answer: 'llm answer' });

    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect((service as any).graph.invoke).toHaveBeenCalledTimes(1);
  });

  it('scopes cache entries by organization to avoid tenant leakage', async () => {
    const { service, redis } = createService();
    redis.get.mockResolvedValue(null);
    (service as any).graph.invoke.mockResolvedValue({ answer: 'answer' });

    await service.diagnose('org-1', 'run-123', 'same question');
    await service.diagnose('org-2', 'run-123', 'same question');

    const keys = redis.set.mock.calls.map(([key]) => key);
    expect(new Set(keys).size).toBe(2);
    expect(keys[0]).toContain('org:org-1:integration-diagnostics:run-123:');
    expect(keys[1]).toContain('org:org-2:integration-diagnostics:run-123:');
  });
});

describe('evidence-version cache keys', () => {
  it('separates changed evidence and exact-case questions without reusing a stale fill', async () => {
    const events = {
      list: vi.fn().mockResolvedValue([{ id: 'event-a', status: 'RUNNING' }]),
    };
    const redis = {
      isAvailable: () => true,
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(true),
    };
    const service = new IntegrationDiagnosticAgentService(
      events as never,
      {} as never,
      redis as never,
    );
    (service as any).graph = {
      invoke: vi.fn().mockResolvedValue({ answer: 'answer' }),
    };
    await service.diagnose('org', 'run', 'Explain ABC');
    events.list.mockResolvedValue([{ id: 'event-b', status: 'FAILED' }]);
    await service.diagnose('org', 'run', 'Explain ABC');
    await service.diagnose('org', 'run', 'Explain abc');
    expect(new Set(redis.get.mock.calls.map(([key]) => key)).size).toBe(3);
    expect((service as any).graph.invoke.mock.calls[1][0].evidence).toContain(
      'FAILED',
    );
  });
});
