import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/types/jwt-payload.js';
import { WorkflowRunService } from '../workflow-run/workflow-run.service.js';
import { RunbookRetrievalService } from '../runbook/runbook-retrieval.service.js';
import { GeminiGroundedDiagnosticsService } from './gemini-grounded-diagnostics.service.js';
import {
  PythonDiagnosticsClient,
  type GroundingContext,
} from './python-diagnostics.client.js';

@Injectable()
export class GroundedDiagnosticsService {
  constructor(
    private readonly runs: WorkflowRunService,
    private readonly retrieval: RunbookRetrievalService,
    private readonly python: PythonDiagnosticsClient,
    @Optional() private readonly gemini?: GeminiGroundedDiagnosticsService,
  ) {}

  async diagnose(
    question: string,
    runId: string,
    user: JwtPayload,
    mode: 'keyword' | 'vector' | 'hybrid',
    signal?: AbortSignal,
    provider: 'python' | 'gemini' = 'python',
  ) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const timer = setTimeout(cancel, 35000);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      return await this.run(
        question,
        runId,
        user,
        mode,
        controller.signal,
        provider,
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }

  private async run(
    question: string,
    runId: string,
    user: JwtPayload,
    mode: 'keyword' | 'vector' | 'hybrid',
    signal: AbortSignal,
    provider: 'python' | 'gemini',
  ) {
    signal.throwIfAborted();
    if (
      typeof question !== 'string' ||
      question.trim().length < 3 ||
      question.length > 1000 ||
      !['keyword', 'vector', 'hybrid'].includes(mode)
    )
      throw new BadRequestException(
        'Grounded questions must contain 3–1000 characters',
      );
    // Neither retrieval nor model work can happen before the authorized run lookup.
    const run = await this.runs.findOne(runId, user.organizationId);
    const engine = provider === 'gemini' ? this.gemini : this.python;
    if (!engine?.isEnabled())
      throw new ServiceUnavailableException(
        'Requested grounded diagnostics provider is not configured',
      );
    const result = await this.retrieval.search(
      { query: question.trim(), mode, limit: 5 },
      user,
      signal,
    );
    const grounding: GroundingContext = {
      mode,
      passages: result.passages.map((p) => ({
        chunkId: p.chunkId,
        documentId: p.documentId,
        sourceKey: p.sourceKey,
        version: p.version,
        documentHash: p.documentHash,
        chunkHash: p.chunkHash,
        content: p.content,
      })),
    };
    signal?.throwIfAborted();
    let diagnostics;
    try {
      diagnostics = await engine.diagnose(
        user.organizationId,
        question.trim(),
        run,
        grounding,
        signal,
      );
    } catch {
      throw new ServiceUnavailableException('Grounded diagnostics unavailable');
    }
    // Never downgrade a grounded request to an ungrounded TypeScript/provider response.
    const evidence = diagnostics.grounding;
    if (!evidence)
      throw new ServiceUnavailableException('Grounded diagnostics unavailable');
    const logTimes = new Map(
      (diagnostics.evidence ?? []).map((log) => [log.id, log.createdAt]),
    );
    const answer = [
      provider === 'gemini'
        ? '[Incident report]'
        : '[Grounded evidence — root cause not established]',
      diagnostics.summary,
      `Root cause: ${diagnostics.rootCause.status === 'not_applicable' ? 'No failure established by the run status.' : 'Undetermined from available evidence.'}`,
      ...(evidence.status === 'insufficient_evidence'
        ? ['Insufficient evidence for supported observations.']
        : []),
      ...evidence.observations.map((o) => {
        const p = evidence.passages.find((p) => p.chunkId === o.passage_id)!;
        if (provider === 'gemini') {
          return `Timeline ${logTimes.get(o.log_id) ?? ''} · log ${o.log_id}: ${o.claim}\nRunbook guidance to review · ${p.sourceKey} v${p.version} (chunk ${p.chunkId}): ${o.passage_quote}`;
        }
        return `Observed log ${o.log_id}: ${o.claim}\nRelated runbook ${p.sourceKey} v${p.version} (${p.documentHash}, chunk ${p.chunkId}): ${o.passage_quote}\nThis reference does not establish a cause or verified fix.`;
      }),
      ...(diagnostics.conflictingGuidance ?? []).map(
        (item) =>
          `Potentially conflicting guidance · ${item.sourceKey} v${item.version} (chunk ${item.passageId}): ${item.quote}`,
      ),
      ...(provider === 'gemini'
        ? (diagnostics.nextSteps ?? []).map(
            (step) => `Operator follow-up: ${step}`,
          )
        : []),
      ...diagnostics.limitations.map((item) => `Limitation: ${item}`),
    ].join('\n');
    const source =
      provider === 'gemini' ? 'gemini-grounded' : 'python-grounded';
    return { answer, source, diagnostics };
  }
}
