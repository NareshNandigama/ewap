import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerScope } from './provider-limits.js';
afterEach(() => vi.useRealTimers());
describe('bounded provider work', () => {
  it('propagates cancellation to pending work', async () => {
    const abort = new AbortController(),
      scope = providerScope('question', { signal: abort.signal });
    const pending = scope.wait(new Promise(() => {}));
    const expected = expect(pending).rejects.toThrow();
    abort.abort();
    await expected;
    expect(scope.signal.aborted).toBe(true);
    scope.close();
  });
  it('terminates a stalled operation at the deadline', async () => {
    vi.useFakeTimers();
    const scope = providerScope('question');
    const expected = expect(scope.wait(new Promise(() => {}))).rejects.toThrow(
      'deadline',
    );
    await vi.advanceTimersByTimeAsync(30000);
    await expected;
    scope.close();
  });
  it('bounds input, output, and concurrent calls and releases slots', () => {
    expect(() => providerScope('x'.repeat(120001))).toThrow('input');
    const scopes = Array.from({ length: 8 }, () => providerScope('question'));
    expect(() => providerScope('question')).toThrow('capacity');
    expect(() => scopes[0].checkOutput('x'.repeat(32001))).toThrow('output');
    for (const scope of scopes) scope.close();
    const next = providerScope('question');
    next.close();
  });
});
