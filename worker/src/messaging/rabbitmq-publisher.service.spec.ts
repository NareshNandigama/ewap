import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  createChannel: vi.fn(),
  setup: undefined as any,
}));
vi.mock('amqp-connection-manager', () => ({
  connect: () => ({
    on: vi.fn(),
    close: vi.fn(),
    createChannel: mocks.createChannel,
  }),
}));
vi.mock('./rabbitmq-topology.service.js', () => ({ setupTopology: vi.fn() }));
import { RabbitMqPublisherService } from './rabbitmq-publisher.service.js';
const data = { runId: 'run', workflowId: 'workflow' };
beforeEach(() => {
  mocks.publish.mockReset();
  mocks.createChannel.mockImplementation((options) => {
    mocks.setup = options.setup;
    return { on: vi.fn(), close: vi.fn(), publish: mocks.publish };
  });
});
describe('publisher confirmation and routing', () => {
  it('waits for broker confirmation', async () => {
    let confirm!: () => void;
    mocks.publish.mockReturnValue(
      new Promise<void>((resolve) => {
        confirm = resolve;
      }),
    );
    const service = new RabbitMqPublisherService();
    service.onModuleInit();
    let done = false;
    const pending = service.publishRetry(data, 1).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    confirm();
    await pending;
    expect(done).toBe(true);
    expect(mocks.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ confirm: true, publishTimeout: 10000 }),
    );
  });
  it('rejects returned messages even if broker ACKs publication', async () => {
    const service = new RabbitMqPublisherService();
    service.onModuleInit();
    const channel = new EventEmitter();
    await mocks.setup(channel);
    mocks.publish.mockImplementation(
      async (_exchange, _route, _body, options) => {
        channel.emit('return', {
          properties: { messageId: options.messageId },
        });
      },
    );
    await expect(service.publishRetry(data, 1)).rejects.toThrow('Unroutable');
  });
  it('rejects disconnect/timeout instead of claiming delivery', async () => {
    mocks.publish.mockRejectedValue(new Error('timeout'));
    const service = new RabbitMqPublisherService();
    service.onModuleInit();
    await expect(service.publishToDlq(data, 3)).rejects.toThrow('timeout');
  });
  it('bounds pending work during backpressure and permits later calls', async () => {
    mocks.publish.mockReturnValue(new Promise(() => {}));
    const service = new RabbitMqPublisherService();
    service.onModuleInit();
    for (let i = 0; i < 16; i++) void service.publishRetry(data, 1);
    await expect(service.publishRetry(data, 1)).rejects.toThrow('full');
  });
});
