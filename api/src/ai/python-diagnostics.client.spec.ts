import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PythonDiagnosticsClient } from './python-diagnostics.client.js';

const key = 'test-service-key-' + 'a'.repeat(32);
const run = {
  id: 'run-1',
  status: 'FAILED',
  logs: [
    {
      id: 'log-1',
      level: 'ERROR',
      message: 'Connection timed out',
      createdAt: new Date('2026-11-12T10:00:00Z'),
    },
  ],
};
const report = {
  analysisMode: 'deterministic',
  organizationId: 'org-1',
  workflowRunId: 'run-1',
  executionStatus: 'FAILED',
  summary: 'The run failed.',
  evidence: [{ ...run.logs[0], createdAt: '2026-11-12T10:00:00Z' }],
  rootCause: {
    status: 'undetermined',
    explanation: 'Root cause is undetermined.',
  },
  limitations: ['Only supplied evidence was used.'],
  nextSteps: ['Review the evidence.'],
};

describe('PythonDiagnosticsClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const create = (overrides = {}) =>
    new PythonDiagnosticsClient(
      new ConfigService({
        AI_DIAGNOSTICS_URL: 'http://127.0.0.1:8001',
        AI_SERVICE_API_KEY: key,
        AI_DIAGNOSTICS_TIMEOUT_MS: 100,
        ...overrides,
      }),
    );
  const request = (client = create(), evidence: unknown = run) =>
    client.diagnose('org-1', 'Why did this fail?', evidence as never);
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sends only authorized evidence and service credentials without following redirects', async () => {
    fetchMock.mockResolvedValue(Response.json(report));
    await expect(request()).resolves.toEqual(report);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8001/v1/diagnostics/workflow-run');
    expect(options.headers['X-EWAP-Service-Key']).toBe(key);
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.redirect).toBe('error');
    expect(JSON.parse(options.body)).toEqual({
      organizationId: 'org-1',
      question: 'Why did this fail?',
      workflowRun: {
        id: run.id,
        status: run.status,
        logs: [{ ...run.logs[0], createdAt: '2026-11-12T10:00:00.000Z' }],
      },
    });
  });

  it('accepts model hypotheses only with validated citations and usage', async () => {
    const modelReport = {
      ...report,
      analysisMode: 'llm',
      findings: [
        { hypothesis: 'Possible timeout', log_id: 'log-1', quote: 'timed out' },
      ],
      usage: { model: 'test-model', inputTokens: 100, outputTokens: 20 },
    };
    fetchMock.mockResolvedValue(Response.json(modelReport));
    await expect(request()).resolves.toEqual(modelReport);
    for (const invalid of [
      {
        ...modelReport,
        findings: [{ ...modelReport.findings[0], log_id: 'foreign' }],
      },
      {
        ...modelReport,
        findings: [{ ...modelReport.findings[0], quote: 'invented' }],
      },
      { ...modelReport, usage: { ...modelReport.usage, inputTokens: -1 } },
      { ...modelReport, analysisMode: 'deterministic' },
    ]) {
      fetchMock.mockResolvedValue(Response.json(invalid));
      await expect(request()).rejects.toMatchObject({
        reason: 'invalid_response',
      });
    }
  });

  it('checks grounded claims, source versions/hashes and source snapshot membership', async () => {
    const passage = {
      chunkId: 'chunk-1',
      documentId: 'doc-1',
      sourceKey: 'timeouts',
      version: 3,
      documentHash: 'a'.repeat(64),
      chunkHash: 'b'.repeat(64),
      content: 'Inspect worker connectivity.',
    };
    const context = { mode: 'keyword' as const, passages: [passage] };
    const observation = {
      claim: run.logs[0].message,
      log_id: run.logs[0].id,
      log_quote: run.logs[0].message,
      passage_id: passage.chunkId,
      passage_quote: passage.content,
    };
    const grounded = {
      ...report,
      analysisMode: 'llm',
      findings: [],
      usage: { model: 'test-model', inputTokens: 100, outputTokens: 40 },
      grounding: {
        status: 'supported_observations',
        passages: [passage],
        observations: [observation],
      },
    };
    const ask = () =>
      create().diagnose('org-1', 'Why failed?', run as never, context);
    fetchMock.mockResolvedValue(Response.json(grounded));
    await expect(ask()).resolves.toEqual(grounded);
    expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body).grounding).toEqual(
      context,
    );
    for (const invalid of [
      {
        ...grounded,
        grounding: {
          ...grounded.grounding,
          passages: [{ ...passage, version: 4 }],
        },
      },
      {
        ...grounded,
        grounding: {
          ...grounded.grounding,
          passages: [{ ...passage, chunkHash: 'c'.repeat(64) }],
        },
      },
      {
        ...grounded,
        grounding: {
          ...grounded.grounding,
          observations: [
            { ...observation, claim: 'The firewall caused this incident' },
          ],
        },
      },
      {
        ...grounded,
        grounding: {
          ...grounded.grounding,
          observations: [{ ...observation, passage_id: 'foreign-tenant' }],
        },
      },
      {
        ...grounded,
        grounding: {
          ...grounded.grounding,
          observations: [
            { ...observation, passage_quote: 'Fabricated recommendation' },
          ],
        },
      },
      {
        ...grounded,
        grounding: { ...grounded.grounding, status: 'insufficient_evidence' },
      },
      { ...grounded, grounding: undefined },
    ]) {
      fetchMock.mockResolvedValue(Response.json(invalid));
      await expect(ask()).rejects.toMatchObject({ reason: 'invalid_response' });
    }
    fetchMock.mockResolvedValue(
      Response.json({
        ...grounded,
        usage: undefined,
        grounding: {
          ...grounded.grounding,
          status: 'insufficient_evidence',
          observations: [],
        },
      }),
    );
    await expect(ask()).resolves.toMatchObject({
      grounding: { status: 'insufficient_evidence' },
    });
  });

  it('maps cached timestamps, omits private fields, and bounds logs/messages', async () => {
    const evidence = {
      ...run,
      secret: 'never-send',
      logs: Array.from({ length: 101 }, (_, i) => ({
        ...run.logs[0],
        id: `log-${i}`,
        createdAt: '2026-11-12T10:00:00Z',
        message: 'm'.repeat(2500),
        metadata: 'never-send',
      })),
    };
    fetchMock.mockResolvedValue(Response.json({ ...report, evidence: [] }));
    await request(create(), evidence);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.workflowRun.logs).toHaveLength(100);
    expect(body.workflowRun.logs[0].id).toBe('log-1');
    expect(body.workflowRun.logs[0].message).toHaveLength(2000);
    expect(fetchMock.mock.calls[0][1].body).not.toContain('never-send');
  });

  it.each([401, 403, 422, 429, 500, 503, 302])(
    'rejects HTTP %s',
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response('private downstream error', { status }),
      );
      await expect(request()).rejects.toMatchObject({ reason: 'http_error' });
    },
  );

  it.each([
    {},
    { ...report, organizationId: 'other-org' },
    { ...report, workflowRunId: 'other-run' },
    { ...report, executionStatus: 'SUCCESS' },
    { ...report, analysisMode: 'llm' },
    { ...report, extra: 'unknown' },
    { ...report, rootCause: { status: 'confirmed', explanation: 'invented' } },
    { ...report, evidence: [{ ...report.evidence[0], message: 'fabricated' }] },
    { ...report, evidence: [report.evidence[0], report.evidence[0]] },
  ])('rejects invalid or mismatched report %#', async (invalid) => {
    fetchMock.mockResolvedValue(Response.json(invalid));
    await expect(request()).rejects.toMatchObject({
      reason: 'invalid_response',
    });
  });

  it('rejects malformed JSON, non-JSON content, and oversized responses', async () => {
    for (const response of [
      new Response('{', { headers: { 'Content-Type': 'application/json' } }),
      new Response('proxy page'),
      new Response('x'.repeat(1024 * 1024 + 1), {
        headers: { 'Content-Type': 'application/json' },
      }),
    ]) {
      fetchMock.mockResolvedValueOnce(response);
      await expect(request()).rejects.toMatchObject({
        reason: 'invalid_response',
      });
    }
  });

  it('classifies network failures without exposing details', async () => {
    fetchMock.mockRejectedValue(new Error('private-url-or-secret'));
    await expect(request()).rejects.toMatchObject({
      reason: 'unavailable',
      message: 'unavailable',
    });
  });

  it.each([false, true])(
    'aborts at deadline including response body reads: %s',
    async (headersReceived) => {
      vi.useFakeTimers();
      fetchMock.mockImplementation((_url, options) => {
        if (!headersReceived)
          return new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          });
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                options.signal.addEventListener('abort', () =>
                  controller.error(new Error('aborted')),
                );
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      });
      const check = expect(request()).rejects.toMatchObject({
        reason: 'timeout',
      });
      await vi.advanceTimersByTimeAsync(100);
      await check;
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    },
  );

  it('is disabled without a URL', () => {
    expect(new PythonDiagnosticsClient(new ConfigService()).isEnabled()).toBe(
      false,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { AI_SERVICE_API_KEY: undefined },
    { AI_SERVICE_API_KEY: 'short' },
    { AI_DIAGNOSTICS_URL: 'http://remote.example' },
    { AI_DIAGNOSTICS_URL: 'https://user:password@example.com' },
    { AI_DIAGNOSTICS_URL: 'https://example.com/path' },
    { AI_DIAGNOSTICS_URL: 'https://example.com?query=secret' },
    { AI_DIAGNOSTICS_TIMEOUT_MS: 0 },
    { AI_DIAGNOSTICS_TIMEOUT_MS: 100.5 },
    { AI_DIAGNOSTICS_TIMEOUT_MS: 'invalid' },
  ])('rejects unsafe configuration %#', (overrides) => {
    expect(() => create(overrides)).toThrow();
  });
});
