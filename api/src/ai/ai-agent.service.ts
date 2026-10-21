
import { Inject, Injectable } from '@nestjs/common';
import {
  Annotation,
  END,
  START,
  StateGraph,
} from '@langchain/langgraph';

import type { LlmProvider } from './providers/llm-provider.js';
import { WorkflowRunTool } from './tools/workflow-run.tool.js';
import type { ToolResult } from './tools/tool-result.js';

const AgentState = Annotation.Root({
  question: Annotation<string>(),
  workflowRunId: Annotation<string>(),
  organizationId: Annotation<string>(),
  toolResult: Annotation<ToolResult | null>(),
  answer: Annotation<string>(),
});

@Injectable()
export class AiAgentService {
  private readonly graph;

  constructor(
    @Inject('LLM_PROVIDER')
    private readonly llmProvider: LlmProvider,
    private readonly workflowRunTool: WorkflowRunTool,
  ) {
    this.graph = new StateGraph(AgentState)
      .addNode('fetchWorkflowRun', async (state) => {
        const toolResult =
          await this.workflowRunTool.getWorkflowRun(
            state.workflowRunId,
            state.organizationId,
          );

        return { toolResult };
      })
      .addNode('generateDiagnosis', async (state) => {
        if (!state.toolResult?.success) {
          return {
            answer:
              'Unable to retrieve workflow run data. ' +
              'Please verify the run ID and your access.',
          };
        }

        const prompt = `
You are the EWAP Engineering Assistant.

Answer the user's question using only the provided
workflow execution data.

Question:
${state.question}

Workflow execution data:
${JSON.stringify(state.toolResult.data, null, 2)}

Rules:
- Do not invent errors, logs, or execution steps.
- If status is PENDING, explain that execution has not started.
- If status is RUNNING, explain that execution is in progress.
- If status is SUCCESS, do not claim a failure.
- If status is FAILED, identify likely causes only when
  supported by logs or metadata.
- If evidence is insufficient, say so clearly.
`;

        const answer = await this.llmProvider.generate(prompt);

        return { answer };
      })
      .addEdge(START, 'fetchWorkflowRun')
      .addEdge('fetchWorkflowRun', 'generateDiagnosis')
      .addEdge('generateDiagnosis', END)
      .compile();
  }

  async diagnose(
    question: string,
    workflowRunId: string,
    organizationId: string,
  ): Promise<{ answer: string }> {
    if (!organizationId) {
      throw new Error('Organization context is required');
    }

    const result = await this.graph.invoke({
      question,
      workflowRunId,
      organizationId,
      toolResult: null,
      answer: '',
    });

    return { answer: result.answer };
  }
}
