import { Inject, Injectable } from '@nestjs/common';

import type { LlmProvider } from './providers/llm-provider.js';
import { WorkflowRunTool } from './tools/workflow-run.tool.js';
import { AiConversationService } from './ai-conversation.service.js';

@Injectable()
export class AiService {
  constructor(
    @Inject('LLM_PROVIDER')
    private readonly llmProvider: LlmProvider,
    private readonly workflowRunTool: WorkflowRunTool,
    private readonly aiConversationService: AiConversationService,
  ) {}

  async ask(
    question: string,
    workflowRunId: string,
    conversationId?: string,
    userId?: string,
    organizationId?: string,
  ): Promise<{ answer: string }> {
    const prompt = await this.buildPrompt(
      question,
      workflowRunId,
      conversationId,
      userId,
      organizationId,
    );

    const answer = await this.llmProvider.generate(prompt);

    return {
      answer,
    };
  }

  async *askStream(
    question: string,
    workflowRunId: string,
    conversationId?: string,
    userId?: string,
    organizationId?: string,
  ): AsyncIterable<string> {
    const prompt = await this.buildPrompt(
      question,
      workflowRunId,
      conversationId,
      userId,
      organizationId,
    );

    for await (
      const chunk of this.llmProvider.generateStream(prompt)
    ) {
      yield chunk;
    }
  }

  private async buildPrompt(
    question: string,
    workflowRunId: string,
    conversationId?: string,
    userId?: string,
    organizationId?: string,
  ): Promise<string> {
    let conversationHistory = '';

    if (conversationId && userId) {
      const messages =
        await this.aiConversationService.getMessages(
          conversationId,
          userId,
        );

      conversationHistory = messages
        .map(
          (message) =>
            `${message.role}: ${message.content}`,
        )
        .join('\n');
    }

    if (!organizationId) {
      throw new Error(
        'Organization context is required to access workflow run data',
      );
    }

    const toolResult =
      await this.workflowRunTool.getWorkflowRun(
        workflowRunId,
        organizationId,
      );

    return `
You are the EWAP Engineering Assistant.

Your job is to help engineers understand and diagnose workflow executions.

Conversation history:
${conversationHistory || '(No previous messages)'}

Current user question:
${question}

Current workflow run:
${JSON.stringify(toolResult.data, null, 2)}

Instructions:

- Answer using the workflow run data and conversation history.
- Pay close attention to the workflow run status.
- Do not claim that a workflow failed unless the available data shows that it failed.
- If the workflow is PENDING, explain that it has not started execution yet.
- If the workflow is RUNNING, explain that execution is still in progress.
- If the workflow is SUCCESS, do not invent a failure.
- If the workflow is FAILED, use the available logs and metadata to identify the likely failure and explain it.
- If logs or other evidence are insufficient to determine a root cause, clearly say so.
- Do not invent logs, errors, workflow steps, causes, or system behavior that are not present in the available data.
`;
  }
}