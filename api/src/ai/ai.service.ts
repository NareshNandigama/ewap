import { Inject, Injectable } from '@nestjs/common';

import type { LlmProvider } from './providers/llm-provider.js';
import { WorkflowRunTool } from './tools/workflow-run.tool.js';

@Injectable()
export class AiService {
  constructor(
    @Inject('LLM_PROVIDER')
    private readonly llmProvider: LlmProvider,
    private readonly workflowRunTool: WorkflowRunTool
  ) {}

  async ask(question: string): Promise<{ answer: string }> {

    const runIdMatch = question.match(
        /workflow run ([a-f0-9-]{36})/i,
    );

    if (runIdMatch) {
        const toolResult = await this.workflowRunTool.getWorkflowRun(
        runIdMatch[1],
        );

        const prompt = `
        You are the EWAP Engineering Assistant.

        User question:
        ${question}

        Workflow run data:
        ${JSON.stringify(toolResult.data, null, 2)}

        Explain the answer using the workflow run data above.
        Do not invent information that is not present in the data.
        `;

        const answer = await this.llmProvider.generate(prompt);
        return { answer };
    }

    const answer = await this.llmProvider.generate(question);
    return {
      answer,
    };
  }
}