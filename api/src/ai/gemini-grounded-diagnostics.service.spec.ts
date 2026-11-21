import { ConfigService } from '@nestjs/config';
import { beforeEach, expect, it, vi } from 'vitest';
import { GeminiGroundedDiagnosticsService } from './gemini-grounded-diagnostics.service.js';
import type { GroundingContext } from './python-diagnostics.client.js';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@google/genai', () => ({
  FinishReason: { STOP: 'STOP' },
  ThinkingLevel: { LOW: 'LOW' },
  GoogleGenAI: class {
    models = { generateContent: create };
  },
}));

const logQuote = 'Connection timed out after retry';
const passageQuote = 'Inspect worker connectivity after a timeout.';
const run = {
  id: 'run-1',
  status: 'FAILED',
  logs: [
    { id: 'log-1', level: 'ERROR', message: logQuote, createdAt: new Date() },
  ],
} as Parameters<GeminiGroundedDiagnosticsService['diagnose']>[2];
const grounding: GroundingContext = {
  mode: 'keyword',
  passages: [
    {
      chunkId: 'chunk-1',
      documentId: 'doc-1',
      sourceKey: 'worker',
      version: 2,
      documentHash: 'a'.repeat(64),
      chunkHash: 'b'.repeat(64),
      content: passageQuote,
    },
  ],
};
const valid = {
  claim: logQuote,
  log_id: 'log-1',
  log_quote: logQuote,
  passage_id: 'chunk-1',
  passage_quote: passageQuote,
};
const diagnose = (context = grounding) =>
  new GeminiGroundedDiagnosticsService(
    new ConfigService({ GEMINI_API_KEY: 'synthetic' }),
  ).diagnose(
    'org-1',
    'connection timeout',
    run,
    context,
    new AbortController().signal,
  );

beforeEach(() => create.mockReset());

const modelResponse = (value: object) => ({
  candidates: [{ finishReason: 'STOP' }],
  text: JSON.stringify(value),
  usageMetadata: {
    promptTokenCount: 10,
    candidatesTokenCount: 4,
    thoughtsTokenCount: 2,
  },
});

it('runs separate evidence agents and publishes only validated synthesis', async () => {
  create
    .mockResolvedValueOnce(
      modelResponse({
        evidence: [
          { id: 'log-1', quote: logQuote },
          { id: 'log-1', quote: 'The broker was offline' },
        ],
      }),
    )
    .mockResolvedValueOnce(
      modelResponse({
        evidence: [
          { id: 'chunk-1', quote: passageQuote },
          { id: 'other-tenant', quote: passageQuote },
        ],
      }),
    )
    .mockResolvedValueOnce(
      modelResponse({
        observations: [
          valid,
          { ...valid, passage_id: 'other-tenant' },
          { ...valid, claim: 'The broker was offline' },
          {
            ...valid,
            claim: 'Connection timed out',
            log_quote: 'Connection timed out',
          },
        ],
      }),
    );
  const report = await diagnose();
  expect(report.grounding).toEqual({
    status: 'supported_observations',
    observations: [valid],
    passages: grounding.passages,
  });
  expect(report.rootCause.status).toBe('undetermined');
  expect(report.usage).toMatchObject({ inputTokens: 30, outputTokens: 18 });
  expect(create).toHaveBeenCalledTimes(3);
  const [investigator, researcher, synthesis] = create.mock.calls.map(
    ([request]) => request,
  );
  expect(investigator.config).toMatchObject({
    systemInstruction: expect.stringContaining('workflow investigator'),
    responseMimeType: 'application/json',
    abortSignal: expect.any(AbortSignal),
    httpOptions: { retryOptions: { attempts: 1 } },
  });
  expect(researcher.config.systemInstruction).toContain('runbook researcher');
  expect(synthesis.config.systemInstruction).toContain('synthesis agent');
  expect(JSON.parse(investigator.contents)).toEqual({
    question: 'connection timeout',
    sources: [{ id: 'log-1', text: logQuote }],
  });
  expect(JSON.parse(researcher.contents)).toEqual({
    question: 'connection timeout',
    sources: [{ id: 'chunk-1', text: passageQuote }],
  });
  expect(JSON.parse(synthesis.contents)).toEqual({
    question: 'connection timeout',
    logQuotes: [{ id: 'log-1', quote: logQuote }],
    passageQuotes: [{ id: 'chunk-1', quote: passageQuote }],
  });
});

it('abstains without calling Gemini when no passages match', async () => {
  const report = await diagnose({ mode: 'keyword', passages: [] });
  expect(report.grounding?.status).toBe('insufficient_evidence');
  expect(report.nextSteps).toEqual([
    'Find the current runbook for this workflow and retry using terms from its text.',
  ]);
  expect(create).not.toHaveBeenCalled();
});

it('rejects malformed provider responses', async () => {
  create.mockResolvedValue(modelResponse({ evidence: [{}] }));
  await expect(diagnose()).rejects.toThrow('Invalid Gemini grounding response');
});

it('skips synthesis if a specialist finds no supported quote', async () => {
  create
    .mockResolvedValueOnce(
      modelResponse({ evidence: [{ id: 'log-1', quote: logQuote }] }),
    )
    .mockResolvedValueOnce(modelResponse({ evidence: [] }));
  const report = await diagnose();
  expect(report.grounding?.status).toBe('insufficient_evidence');
  expect(create).toHaveBeenCalledTimes(2);
});

it('flags conflicting excerpts from two distinct runbooks and asks for clarification', async () => {
  const other = {
    ...grounding.passages[0],
    chunkId: 'chunk-2',
    sourceKey: 'release-freeze',
    content: 'Wait to investigate worker connectivity until the freeze ends.',
  };
  const conflicts = [
    { id: 'chunk-1', quote: passageQuote },
    { id: 'chunk-2', quote: other.content },
  ];
  create
    .mockResolvedValueOnce(
      modelResponse({ evidence: [{ id: 'log-1', quote: logQuote }] }),
    )
    .mockResolvedValueOnce(modelResponse({ evidence: conflicts }))
    .mockResolvedValueOnce(modelResponse({ observations: [valid], conflicts }));
  const report = await diagnose({
    ...grounding,
    passages: [...grounding.passages, other],
  });
  expect(report.grounding).toMatchObject({
    status: 'insufficient_evidence',
    observations: [],
  });
  expect(report.conflictingGuidance?.map(({ sourceKey }) => sourceKey)).toEqual(
    ['worker', 'release-freeze'],
  );
  expect(report.nextSteps).toEqual([
    'Which runbook governs the affected environment and release window?',
  ]);
});

it('cancels the other specialist when one call fails', async () => {
  create
    .mockRejectedValueOnce(new Error('provider unavailable'))
    .mockImplementationOnce(() => new Promise(() => {}));
  await expect(diagnose()).rejects.toThrow('provider unavailable');
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[1][0].config.abortSignal.aborted).toBe(true);
});
