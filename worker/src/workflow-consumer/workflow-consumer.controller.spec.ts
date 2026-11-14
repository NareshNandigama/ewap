import { describe, expect, it, vi } from 'vitest';
import { WorkflowConsumerController } from './workflow-consumer.controller.js';
import { WorkflowExecutionFailed } from './workflow-consumer.service.js';
const data = {
  runId: '11111111-1111-4111-8111-111111111111',
  workflowId: '22222222-2222-4222-8222-222222222222',
};
function setup(error: Error, retry = 0) {
  const executor = { executeWorkflow: vi.fn().mockRejectedValue(error) };
  const publisher = {
    publishRetry: vi.fn().mockResolvedValue(undefined),
    publishToDlq: vi.fn().mockResolvedValue(undefined),
  };
  const channel = { ack: vi.fn(), nack: vi.fn() };
  const message = { properties: { headers: { 'x-retry-count': retry } } };
  const context = { getChannelRef: () => channel, getMessage: () => message };
  return {
    publisher,
    channel,
    message,
    run: () =>
      new WorkflowConsumerController(
        executor as never,
        publisher as never,
      ).handleWorkflowExecution(data, context),
  };
}
describe('confirmed handoff before ACK', () => {
  it('preserves attempt number for infrastructure failures', async () => {
    const { run, publisher, channel } = setup(new Error('db'));
    await run();
    expect(publisher.publishRetry).toHaveBeenCalledWith(data, 0);
    expect(channel.ack).toHaveBeenCalledOnce();
  });
  it('advances only persisted execution failures', async () => {
    const { run, publisher } = setup(new WorkflowExecutionFailed());
    await run();
    expect(publisher.publishRetry).toHaveBeenCalledWith(data, 1);
  });
  it('requeues original if retry confirmation fails', async () => {
    const { run, publisher, channel, message } = setup(
      new WorkflowExecutionFailed(),
    );
    publisher.publishRetry.mockRejectedValue(new Error('disconnect'));
    await run();
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
  });
  it('requeues original if DLQ confirmation fails', async () => {
    const { run, publisher, channel, message } = setup(
      new WorkflowExecutionFailed(),
      3,
    );
    publisher.publishToDlq.mockRejectedValue(new Error('unroutable'));
    await run();
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
  });
});
