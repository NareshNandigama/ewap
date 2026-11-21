import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import Joi from 'joi';
import {
  groundedObservationSchema,
  hasGroundedSupport,
} from './grounding-evidence.js';

import type { WorkflowRunService } from '../workflow-run/workflow-run.service.js';

type AuthorizedRun = Awaited<ReturnType<WorkflowRunService['findOne']>>;
const MAX_BYTES = 1024 * 1024;
const statuses = ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'];

export interface DiagnosticLog {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
  createdAt: string;
}

export interface GroundingPassage {
  chunkId: string;
  documentId: string;
  sourceKey: string;
  version: number;
  documentHash: string;
  chunkHash: string;
  content: string;
}
export interface GroundingContext {
  mode: 'keyword' | 'vector' | 'hybrid';
  passages: GroundingPassage[];
}
export interface GroundedObservation {
  claim: string;
  log_id: string;
  log_quote: string;
  passage_id: string;
  passage_quote: string;
}

export interface PythonDiagnosticReport {
  analysisMode: 'deterministic' | 'llm';
  grounding?: {
    status: 'supported_observations' | 'insufficient_evidence';
    observations: GroundedObservation[];
    passages: GroundingPassage[];
  };
  findings?: { hypothesis: string; log_id: string; quote: string }[];
  conflictingGuidance?: {
    sourceKey: string;
    version: number;
    passageId: string;
    quote: string;
  }[];
  usage?: { model: string; inputTokens: number; outputTokens: number };
  organizationId: string;
  workflowRunId: string;
  executionStatus: string;
  summary: string;
  evidence: DiagnosticLog[];
  rootCause: { status: 'undetermined' | 'not_applicable'; explanation: string };
  limitations: string[];
  nextSteps: string[];
}

const text = () => Joi.string().min(1).max(4000);
const logSchema = Joi.object({
  id: Joi.string().min(1).max(200).required(),
  level: Joi.string().valid('INFO', 'WARN', 'ERROR', 'SUCCESS').required(),
  message: Joi.string().min(1).max(2000).required(),
  createdAt: Joi.string().isoDate().required(),
}).unknown(false);

const passageSchema = Joi.object({
  chunkId: Joi.string().min(1).max(200).required(),
  documentId: Joi.string().min(1).max(200).required(),
  sourceKey: Joi.string().min(1).max(200).required(),
  version: Joi.number().integer().min(1).required(),
  documentHash: Joi.string()
    .pattern(/^[a-f0-9]{64}$/)
    .required(),
  chunkHash: Joi.string()
    .pattern(/^[a-f0-9]{64}$/)
    .required(),
  content: Joi.string().min(1).max(2000).required(),
}).unknown(false);
const responseSchema = Joi.object({
  grounding: Joi.object({
    status: Joi.string()
      .valid('supported_observations', 'insufficient_evidence')
      .required(),
    observations: Joi.array()
      .items(groundedObservationSchema)
      .max(5)
      .required(),
    passages: Joi.array()
      .items(passageSchema)
      .max(5)
      .unique('chunkId')
      .required(),
  }).unknown(false),
  analysisMode: Joi.string().valid('deterministic', 'llm').required(),
  findings: Joi.array()
    .items(
      Joi.object({
        hypothesis: Joi.string().min(1).max(1000).required(),
        log_id: Joi.string().min(1).max(200).required(),
        quote: Joi.string().min(1).max(500).required(),
      }).unknown(false),
    )
    .max(5),
  usage: Joi.object({
    model: Joi.string().min(1).max(200).required(),
    inputTokens: Joi.number().integer().min(0).required(),
    outputTokens: Joi.number().integer().min(0).required(),
  }).unknown(false),
  organizationId: Joi.string().min(1).max(200).required(),
  workflowRunId: Joi.string().min(1).max(200).required(),
  executionStatus: Joi.string()
    .valid(...statuses)
    .required(),
  summary: text().required(),
  evidence: Joi.array().items(logSchema).max(100).unique('id').required(),
  rootCause: Joi.object({
    status: Joi.string().valid('undetermined', 'not_applicable').required(),
    explanation: text().required(),
  })
    .unknown(false)
    .required(),
  limitations: Joi.array().items(text()).max(20).required(),
  nextSteps: Joi.array().items(text()).max(20).required(),
}).unknown(false);

export class PythonDiagnosticsFailure extends Error {
  constructor(
    readonly reason:
      | 'timeout'
      | 'unavailable'
      | 'http_error'
      | 'invalid_response'
      | 'invalid_evidence',
  ) {
    super(reason);
  }
}

@Injectable()
export class PythonDiagnosticsClient {
  private readonly endpoint?: string;
  private readonly key?: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    const url = config.get<string>('AI_DIAGNOSTICS_URL');
    this.key = config.get<string>('AI_SERVICE_API_KEY');
    this.timeoutMs = Number(config.get('AI_DIAGNOSTICS_TIMEOUT_MS') ?? 3000);
    if (
      !Number.isInteger(this.timeoutMs) ||
      this.timeoutMs < 100 ||
      this.timeoutMs > 30000
    ) {
      throw new Error(
        'AI_DIAGNOSTICS_TIMEOUT_MS must be an integer from 100 to 30000',
      );
    }
    if (!url) return; // Opt-in: existing TypeScript diagnostics remain the default.
    const parsed = new URL(url);
    const localHttp =
      parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (
      (!localHttp && parsed.protocol !== 'https:') ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== '/'
    ) {
      throw new Error(
        'AI_DIAGNOSTICS_URL must be an HTTPS origin (HTTP allowed only on loopback)',
      );
    }
    if (!this.key || !/^[\x21-\x7e]{32,512}$/.test(this.key)) {
      throw new Error(
        'AI_SERVICE_API_KEY must contain 32–512 printable ASCII characters without whitespace',
      );
    }
    this.endpoint = new URL('/v1/diagnostics/workflow-run', parsed).href;
  }

  isEnabled(): boolean {
    return Boolean(this.endpoint);
  }

  async diagnose(
    organizationId: string,
    question: string,
    run: AuthorizedRun,
    grounding?: GroundingContext,
    signal?: AbortSignal,
  ): Promise<PythonDiagnosticReport> {
    if (!this.endpoint) throw new PythonDiagnosticsFailure('unavailable');
    const logs: DiagnosticLog[] = run.logs.slice(-100).map((log) => ({
      id: log.id,
      level: log.level,
      message: log.message.trim().slice(0, 2000) || '(empty log message)',
      // Cache hits return ISO strings; database reads return Date objects.
      createdAt: new Date(log.createdAt).toISOString(),
    }));
    const body = JSON.stringify({
      organizationId,
      question,
      ...(grounding ? { grounding } : {}),
      workflowRun: { id: run.id, status: run.status, logs },
    });
    if (Buffer.byteLength(body) > MAX_BYTES)
      throw new PythonDiagnosticsFailure('invalid_evidence');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(cancel, this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        redirect: 'error', // Never forward the service credential to a redirect target.
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-EWAP-Service-Key': this.key!,
          'X-Request-Id': randomUUID(),
        },
        body,
      });
      if (!response.ok) {
        controller.abort();
        throw new PythonDiagnosticsFailure('http_error');
      }
      if (
        !response.headers
          .get('content-type')
          ?.toLowerCase()
          .startsWith('application/json') ||
        !response.body
      ) {
        controller.abort();
        throw new PythonDiagnosticsFailure('invalid_response');
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) {
            controller.abort();
            throw new PythonDiagnosticsFailure('invalid_response');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const raw: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const { error } = responseSchema.validate(raw, { convert: false });
      if (error) throw new PythonDiagnosticsFailure('invalid_response');
      const report = raw as PythonDiagnosticReport;
      const expectedAssessment = ['FAILED', 'CANCELLED'].includes(run.status)
        ? 'undetermined'
        : 'not_applicable';
      if (
        (report.analysisMode === 'llm' &&
          (!report.findings ||
            (!report.usage &&
              report.grounding?.status !== 'insufficient_evidence'))) ||
        (report.analysisMode === 'deterministic' &&
          (report.findings !== undefined || report.usage !== undefined)) ||
        report.findings?.some(
          (finding) =>
            !logs.some(
              (log) =>
                log.id === finding.log_id &&
                log.message.includes(finding.quote),
            ),
        ) ||
        report.organizationId !== organizationId ||
        report.workflowRunId !== run.id ||
        report.executionStatus !== run.status ||
        report.rootCause.status !== expectedAssessment ||
        report.evidence.some(
          (item) =>
            !logs.some(
              (log) =>
                log.id === item.id &&
                log.level === item.level &&
                log.message === item.message &&
                new Date(log.createdAt).getTime() ===
                  new Date(item.createdAt).getTime(),
            ),
        )
      ) {
        throw new PythonDiagnosticsFailure('invalid_response');
      }
      if (grounding) {
        const result = report.grounding;
        const equalPassage = (a: GroundingPassage, b: GroundingPassage) =>
          a.chunkId === b.chunkId &&
          a.documentId === b.documentId &&
          a.sourceKey === b.sourceKey &&
          a.version === b.version &&
          a.documentHash === b.documentHash &&
          a.chunkHash === b.chunkHash &&
          a.content === b.content;
        if (
          !result ||
          result.passages.length !== grounding.passages.length ||
          result.passages.some(
            (p, i) => !equalPassage(p, grounding.passages[i]),
          ) ||
          (result.status === 'supported_observations') !==
            result.observations.length > 0 ||
          (report.findings?.length ?? 0) > 0 ||
          result.observations.some(
            (o) => !hasGroundedSupport(o, logs, grounding.passages),
          )
        )
          throw new PythonDiagnosticsFailure('invalid_response');
      } else if (report.grounding)
        throw new PythonDiagnosticsFailure('invalid_response');
      return report;
    } catch (error) {
      if (error instanceof PythonDiagnosticsFailure) throw error;
      if (controller.signal.aborted)
        throw new PythonDiagnosticsFailure('timeout');
      if (error instanceof SyntaxError)
        throw new PythonDiagnosticsFailure('invalid_response');
      throw new PythonDiagnosticsFailure('unavailable');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      controller.abort();
    }
  }
}
