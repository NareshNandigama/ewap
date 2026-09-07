import { Injectable } from '@nestjs/common';

import { WorkflowRunService } from '../../workflow-run/workflow-run.service.js';
import type { ToolResult } from './tool-result.js';

@Injectable()
export class WorkflowRunTool {
  constructor(
    private readonly workflowRunService: WorkflowRunService,
  ) {}

  async getWorkflowRun(runId: string) {
    try {
      const workflowRun = await this.workflowRunService.findOne(runId);

      return {
        success: true,
        data: workflowRun,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}