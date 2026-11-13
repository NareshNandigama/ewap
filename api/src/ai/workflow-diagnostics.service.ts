import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { WorkflowRunService } from '../workflow-run/workflow-run.service.js';
import { AiAgentService } from './ai-agent.service.js';
import {
  PythonDiagnosticsClient,
  PythonDiagnosticsFailure,
} from './python-diagnostics.client.js';

@Injectable()
export class WorkflowDiagnosticsService {
  private readonly logger = new Logger(WorkflowDiagnosticsService.name);

  constructor(
    private readonly runs: WorkflowRunService,
    private readonly python: PythonDiagnosticsClient,
    private readonly typescript: AiAgentService,
  ) {}

  async diagnose(
    question: string,
    workflowRunId: string,
    organizationId: string,
  ) {
    if (
      typeof organizationId !== 'string' ||
      !organizationId.trim() ||
      organizationId.length > 200 ||
      typeof workflowRunId !== 'string' ||
      !workflowRunId.trim() ||
      workflowRunId.length > 200 ||
      typeof question !== 'string' ||
      question.trim().length < 3 ||
      question.length > 2000
    ) {
      throw new BadRequestException(
        'Valid organization, run ID, and question (3–2000 characters) required',
      );
    }
    // This check must succeed before either Python or LLM diagnostics can run.
    // Authorization/database failures are never swallowed by the fallback block.
    const run = await this.runs.findOne(workflowRunId, organizationId);
    if (this.python.isEnabled()) {
      try {
        const diagnostics = await this.python.diagnose(
          organizationId,
          question.trim(),
          run,
        );
        diagnostics.limitations.push(
          'Snapshot includes at most the latest 100 logs; messages are limited to 2000 characters.',
        );
        const answer = [
          '[Deterministic analysis — no LLM call]',
          diagnostics.summary,
          `Root cause: ${diagnostics.rootCause.explanation}`,
          ...diagnostics.evidence.map(
            (log) => `Evidence ${log.id}: ${log.message}`,
          ),
          ...diagnostics.nextSteps.map((step) => `Next step: ${step}`),
          ...diagnostics.limitations.map((item) => `Limitation: ${item}`),
        ].join('\n');
        return { answer, source: 'python-deterministic' as const, diagnostics };
      } catch (error) {
        const reason =
          error instanceof PythonDiagnosticsFailure
            ? error.reason
            : 'invalid_evidence';
        // Never log the key, URL, question, evidence, or downstream error body.
        this.logger.warn(
          `Python diagnostics unavailable; using TypeScript fallback (${reason})`,
        );
      }
    }
    const result = await this.typescript.diagnose(
      question.trim(),
      workflowRunId,
      organizationId,
    );
    return { ...result, source: 'typescript' as const };
  }
}
