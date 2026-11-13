import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WorkerStatusClient {
  private readonly logger = new Logger(WorkerStatusClient.name);
  private readonly endpoint: string;
  private readonly key: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    const key = config.get<string>('WORKER_STATUS_API_KEY');
    if (!key || !/^[\x21-\x7e]{32,512}$/.test(key))
      throw new Error(
        'WORKER_STATUS_API_KEY must be 32–512 printable ASCII characters without whitespace',
      );
    this.key = key;
    const url = new URL(
      config.get<string>('WORKER_API_BASE_URL') ??
        config.getOrThrow<string>('NEXT_PUBLIC_API_BASE_URL'),
    );
    const localHttp =
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (!localHttp && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      throw new Error(
        'WORKER_API_BASE_URL must be an HTTPS origin (HTTP allowed only on loopback)',
      );
    }
    this.endpoint = new URL('/api/v1/workflow-runs/status', url).href;
    this.timeoutMs = Number(config.get('WORKER_STATUS_TIMEOUT_MS') ?? 3000);
    if (
      !Number.isInteger(this.timeoutMs) ||
      this.timeoutMs < 100 ||
      this.timeoutMs > 30000
    )
      throw new Error('WORKER_STATUS_TIMEOUT_MS must be 100–30000');
  }

  async notify(runId: string, status: string): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-EWAP-Worker-Key': this.key,
        },
        body: JSON.stringify({ runId, status }),
      });
      await response.body?.cancel();
      // An obsolete notification is harmless; never turn an execution into a
      // failure because the API already observes a newer persisted state.
      if (response.ok || response.status === 409) return true;
      this.logger.warn(
        `Status notification not delivered (HTTP ${response.status})`,
      );
      return false;
    } catch {
      this.logger.warn(
        `Status notification not delivered (${controller.signal.aborted ? 'timeout' : 'transport'})`,
      );
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
