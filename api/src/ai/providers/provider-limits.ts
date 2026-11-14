import { ServiceUnavailableException } from '@nestjs/common';
export interface GenerationOptions {
  signal?: AbortSignal;
}
let active = 0;
export const PROVIDER_LIMITS_VERSION = 'bounded-v1';
export function providerScope(prompt: string, options?: GenerationOptions) {
  if (prompt.length > 120000)
    throw new Error('AI input exceeds the configured limit');
  if (active >= 8) throw new ServiceUnavailableException('AI capacity reached');
  options?.signal?.throwIfAborted();
  active++;
  const controller = new AbortController();
  const onAbort = () => controller.abort(options?.signal?.reason);
  options?.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error('AI deadline exceeded')),
    30000,
  );
  let outputLength = 0;
  return {
    signal: controller.signal,
    checkOutput(text: string) {
      outputLength += text.length;
      if (outputLength > 32000) {
        controller.abort(new Error('AI output limit exceeded'));
        throw controller.signal.reason;
      }
      return text;
    },
    async wait<T>(promise: PromiseLike<T>): Promise<T> {
      const task = Promise.resolve(promise);
      if (controller.signal.aborted) {
        void task.catch(() => undefined);
        throw controller.signal.reason;
      }
      let listener!: () => void;
      const cancelled = new Promise<never>((_resolve, reject) => {
        listener = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', listener, { once: true });
      });
      try {
        return await Promise.race([task, cancelled]);
      } finally {
        controller.signal.removeEventListener('abort', listener);
      }
    },
    close() {
      clearTimeout(timer);
      options?.signal?.removeEventListener('abort', onAbort);
      controller.abort();
      active--;
    },
  };
}
