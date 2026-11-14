import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { AiController } from './ai.controller.js';
const user = { sub: 'user', organizationId: 'org', role: 'MEMBER' as const };
const dto = { question: 'question', workflowRunId: 'run' };
function setup(generate: (signal?: AbortSignal) => AsyncIterable<string>) {
  const conversation = {
    createConversation: vi.fn().mockResolvedValue({ id: 'conversation' }),
    getConversation: vi.fn().mockResolvedValue({ id: 'conversation' }),
    addMessage: vi.fn().mockResolvedValue({}),
    startAssistant: vi.fn().mockResolvedValue({ id: 'assistant' }),
    finishAssistant: vi.fn().mockResolvedValue({}),
  };
  const ai = {
    askStream: (
      _q: string,
      _r: string,
      _c: string,
      _u: string,
      _o: string,
      signal?: AbortSignal,
    ) => generate(signal),
  };
  const response = Object.assign(new EventEmitter(), {
    destroyed: false,
    writableEnded: false,
    setHeader: vi.fn(),
    write: vi.fn().mockReturnValue(true),
    end: vi.fn(),
  });
  const controller = new AiController(
    ai as never,
    conversation as never,
    {} as never,
  );
  return {
    conversation,
    response,
    controller,
    run: () => controller.askStream(dto, user, response as never),
  };
}
describe('stream terminal lifecycle', () => {
  it('persists COMPLETED before announcing completion', async () => {
    const { run, conversation, response } = setup(async function* () {
      yield 'answer';
    });
    await run();
    expect(conversation.finishAssistant).toHaveBeenCalledWith(
      'assistant',
      'conversation',
      'user',
      'org',
      'run',
      'answer',
      'COMPLETED',
    );
    const terminal = response.write.mock.calls.find(([value]) =>
      value.startsWith('event: terminal'),
    );
    expect(terminal?.[0]).toContain('COMPLETED');
    expect(
      conversation.finishAssistant.mock.invocationCallOrder[0],
    ).toBeLessThan(response.write.mock.invocationCallOrder.at(-1)!);
  });
  it('persists a partial provider error as FAILED', async () => {
    const { run, conversation, response } = setup(async function* () {
      yield 'partial';
      throw new Error('provider');
    });
    await run();
    expect(conversation.finishAssistant).toHaveBeenLastCalledWith(
      'assistant',
      'conversation',
      'user',
      'org',
      'run',
      'partial',
      'FAILED',
    );
    expect(response.write.mock.calls.at(-1)?.[0]).toContain('FAILED');
  });
  it('propagates disconnect to provider cancellation and persists CANCELLED', async () => {
    let signal: AbortSignal | undefined;
    const fixture = setup(async function* (current) {
      signal = current;
      yield 'partial';
      fixture.response.destroyed = true;
      fixture.response.emit('close');
      current?.throwIfAborted();
    });
    await fixture.run();
    expect(signal?.aborted).toBe(true);
    expect(fixture.conversation.finishAssistant).toHaveBeenLastCalledWith(
      'assistant',
      'conversation',
      'user',
      'org',
      'run',
      'partial',
      'CANCELLED',
    );
  });
  it('writes nothing if the run/conversation authorization fails', async () => {
    const { run, conversation, response } = setup(async function* () {
      yield 'never';
    });
    conversation.createConversation.mockRejectedValue(new Error('not found'));
    await expect(run()).rejects.toThrow('not found');
    expect(conversation.addMessage).not.toHaveBeenCalled();
    expect(response.write).not.toHaveBeenCalled();
  });
});
