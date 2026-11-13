import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WorkflowRunService } from '../workflow-run/workflow-run.service.js';
import { WorkflowRunTool } from './tools/workflow-run.tool.js';
import { AiAgentService } from './ai-agent.service.js';
import { PythonDiagnosticsClient } from './python-diagnostics.client.js';
import { WorkflowDiagnosticsService } from './workflow-diagnostics.service.js';

const run = { id: 'run-1', status: 'FAILED', logs: [] };
const report = {
  analysisMode: 'deterministic',
  organizationId: 'org-1',
  workflowRunId: 'run-1',
  executionStatus: 'FAILED',
  summary: 'Run failed.',
  evidence: [],
  rootCause: { status: 'undetermined', explanation: 'Insufficient evidence.' },
  limitations: [],
  nextSteps: ['Review logs.'],
};

describe('Workflow diagnostics integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  function setup(enabled = true) {
    const prisma = {
      workflowRun: {
        findFirst: vi.fn(async ({ where }) =>
          where.workflow.project.organizationId === 'org-1' &&
          where.id === 'run-1'
            ? run
            : null,
        ),
      },
    };
    const runs = new WorkflowRunService(
      prisma as never,
      {} as never,
      { isAvailable: () => false } as never,
    );
    const llm = {
      generate: vi.fn().mockResolvedValue('Existing TypeScript diagnosis'),
    };
    const agent = new AiAgentService(llm as never, new WorkflowRunTool(runs));
    const python = new PythonDiagnosticsClient(
      new ConfigService(
        enabled
          ? {
              AI_DIAGNOSTICS_URL: 'http://127.0.0.1:8001',
              AI_SERVICE_API_KEY: 'test-service-key-' + 'a'.repeat(32),
              AI_DIAGNOSTICS_TIMEOUT_MS: 100,
            }
          : {},
      ),
    );
    const service = new WorkflowDiagnosticsService(runs, python, agent);
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => Response.json(report));
    vi.stubGlobal('fetch', fetchMock);
    return { service, fetchMock, llm, prisma };
  }

  it('uses scoped lookup, mapping, and response validation without calling the LLM', async () => {
    const { service, fetchMock, llm, prisma } = setup();
    const result = await service.diagnose('What failed?', 'run-1', 'org-1');
    expect(result.source).toBe('python-deterministic');
    expect(result.answer).toContain('no LLM call');
    expect(prisma.workflowRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'run-1',
          workflow: { project: { organizationId: 'org-1' } },
        },
      }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it('rejects another tenant before any external diagnostic request', async () => {
    const { service, fetchMock, llm } = setup();
    await expect(
      service.diagnose('What failed?', 'run-1', 'org-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it('does not turn database failures into fallback', async () => {
    const { service, prisma, fetchMock, llm } = setup();
    prisma.workflowRun.findFirst.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(
      service.diagnose('What failed?', 'run-1', 'org-1'),
    ).rejects.toThrow('database unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it.each([
    'disabled',
    'network',
    'http',
    'invalid',
    'tenant-mismatch',
    'timeout',
  ])('preserves the real TypeScript graph on %s', async (mode) => {
    const { service, fetchMock, llm } = setup(mode !== 'disabled');
    if (mode === 'network')
      fetchMock.mockRejectedValue(new Error('connection refused'));
    if (mode === 'http')
      fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    if (mode === 'invalid') fetchMock.mockResolvedValue(Response.json({}));
    if (mode === 'tenant-mismatch')
      fetchMock.mockResolvedValue(
        Response.json({ ...report, organizationId: 'org-2' }),
      );
    if (mode === 'timeout')
      fetchMock.mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
      );
    await expect(
      service.diagnose('What failed?', 'run-1', 'org-1'),
    ).resolves.toEqual({
      answer: 'Existing TypeScript diagnosis',
      source: 'typescript',
    });
    expect(llm.generate).toHaveBeenCalledOnce();
    expect(llm.generate.mock.calls[0][0]).toContain('run-1');
    if (mode === 'disabled') expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates fallback provider errors', async () => {
    const { service, llm } = setup(false);
    llm.generate.mockRejectedValue(new Error('provider unavailable'));
    await expect(
      service.diagnose('What failed?', 'run-1', 'org-1'),
    ).rejects.toThrow('provider unavailable');
  });

  it.each(['', 'q'.repeat(2001)])(
    'rejects invalid questions before lookup',
    async (question) => {
      const { service, prisma, fetchMock } = setup();
      await expect(
        service.diagnose(question, 'run-1', 'org-1'),
      ).rejects.toMatchObject({ status: 400 });
      expect(prisma.workflowRun.findFirst).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
