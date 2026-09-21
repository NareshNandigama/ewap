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
    conversationId?: string,
    userId?: string,
  ): Promise<{ answer: string }> {
    const prompt = await this.buildPrompt(
      question,
      conversationId,
      userId,
    );

    const answer = await this.llmProvider.generate(prompt);

    return {
      answer,
    };
  }

  async *askStream(
    question: string,
    conversationId?: string,
    userId?: string,
  ): AsyncIterable<string> {
    const prompt = await this.buildPrompt(
      question,
      conversationId,
      userId,
    );

    for await (
      const chunk of this.llmProvider.generateStream(prompt)
    ) {
      yield chunk;
    }
  }

  private async buildPrompt(
    question: string,
    conversationId?: string,
    userId?: string,
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

    const runIdMatch = question.match(
      /workflow run ([a-f0-9-]{36})/i,
    );

    if (runIdMatch) {
      const toolResult =
        await this.workflowRunTool.getWorkflowRun(
          runIdMatch[1],
        );

      return `
You are the EWAP Engineering Assistant.

Conversation history:
${conversationHistory || '(No previous messages)'}

Current user question:
${question}

Workflow run data:
${JSON.stringify(toolResult.data, null, 2)}

Answer using the conversation history and workflow run data.

Do not invent information that is not present in the available data.
If the available data is insufficient, clearly say so.
`;
    }

    return `
You are the EWAP Engineering Assistant.

Conversation history:
${conversationHistory || '(No previous messages)'}

Current user question:
${question}

Answer the user's question using the conversation history.

Do not invent facts.
If you don't have enough information, clearly say so.
`;
  }
}