import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const DIMENSIONS = 768;
export function validVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === DIMENSIONS &&
    value.every(
      (x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1e10,
    ) &&
    value.some((x) => Math.fround(x) !== 0)
  );
}

@Injectable()
export class EmbeddingClient {
  readonly model: string;
  readonly modelKey: string;
  private readonly key?: string;
  constructor(config: ConfigService) {
    this.model = config.get<string>(
      'RUNBOOK_EMBEDDING_MODEL',
      'text-embedding-3-small',
    );
    if (
      !['text-embedding-3-small', 'text-embedding-3-large'].includes(this.model)
    )
      throw new Error('Unsupported runbook embedding model');
    this.modelKey = `openai:${this.model}:${DIMENSIONS}:v1`;
    this.key = config.get<string>('RUNBOOK_EMBEDDING_API_KEY');
  }

  async embed(input: string[], signal?: AbortSignal): Promise<number[][]> {
    if (!this.key)
      throw new ServiceUnavailableException(
        'Runbook embeddings are not configured',
      );
    if (
      !input.length ||
      input.length > 128 ||
      input.some((s) => !s.trim() || s.length > 2000)
    )
      throw new ServiceUnavailableException('Invalid embedding input');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(cancel, 15000);
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.key}`,
        },
        body: JSON.stringify({
          model: this.model,
          dimensions: DIMENSIONS,
          encoding_format: 'float',
          input,
        }),
      });
      if (
        !response.ok ||
        !response.body ||
        !response.headers.get('content-type')?.startsWith('application/json')
      )
        throw new Error();
      const reader = response.body.getReader();
      const parts: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 4 * 1024 * 1024) throw new Error();
          parts.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const raw = JSON.parse(Buffer.concat(parts).toString('utf8'));
      if (
        raw.model !== this.model ||
        !Array.isArray(raw.data) ||
        raw.data.length !== input.length
      )
        throw new Error();
      const vectors: number[][] = [];
      for (const entry of raw.data) {
        if (
          !Number.isInteger(entry.index) ||
          entry.index < 0 ||
          entry.index >= input.length ||
          vectors[entry.index] ||
          !validVector(entry.embedding)
        )
          throw new Error();
        vectors[entry.index] = entry.embedding;
      }
      if (vectors.filter(Boolean).length !== input.length) throw new Error();
      return vectors;
    } catch {
      throw new ServiceUnavailableException(
        'Runbook embedding provider unavailable',
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      controller.abort();
    }
  }
}
