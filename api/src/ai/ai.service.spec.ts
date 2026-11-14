import { describe, expect, it, vi } from 'vitest';
import { AiService } from './ai.service.js';
import { AiConversationService } from './ai-conversation.service.js';
describe('chat authorization before generation', () => {
  it('does not access history or invoke the provider for an unauthorized run', async () => {
    const provider = { generate: vi.fn() };
    const conversations = {
      authorizeRun: vi.fn().mockRejectedValue(new Error('not found')),
      getMessages: vi.fn(),
    };
    const service = new AiService(
      provider as never,
      {} as never,
      conversations as never,
    );
    await expect(
      service.ask('question', 'run', 'conversation', 'user', 'org'),
    ).rejects.toThrow('not found');
    expect(provider.generate).not.toHaveBeenCalled();
    expect(conversations.getMessages).not.toHaveBeenCalled();
  });
  it('binds conversation lookup to the requested run and tenant', async () => {
    const db = {
      aiConversation: { findFirst: vi.fn().mockResolvedValue(null) },
      aiMessage: { create: vi.fn() },
    };
    const service = new AiConversationService(db as never);
    await expect(
      service.addMessage(
        'conversation',
        'user',
        'USER',
        'question',
        'org',
        'run',
      ),
    ).rejects.toThrow('not found');
    expect(db.aiConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'conversation',
          userId: 'user',
          workflowRunId: 'run',
          user: { organizationId: 'org' },
          workflowRun: { workflow: { project: { organizationId: 'org' } } },
        }),
      }),
    );
    expect(db.aiMessage.create).not.toHaveBeenCalled();
  });
});
