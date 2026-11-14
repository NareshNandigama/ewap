import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import Joi from 'joi';

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

export interface PythonDiagnosticReport {
  analysisMode: 'deterministic';
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

const responseSchema = Joi.object({
  analysisMode: Joi.string().valid('deterministic').required(),
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
      workflowRun: { id: run.id, status: run.status, logs },
    });
    if (Buffer.byteLength(body) > MAX_BYTES)
      throw new PythonDiagnosticsFailure('invalid_evidence');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
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
    }
  }
}
