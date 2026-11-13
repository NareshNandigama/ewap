import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';

@Injectable()
export class WorkerStatusGuard implements CanActivate {
  private readonly digest?: Buffer;
  constructor(config: ConfigService) {
    const key = config.get<string>('WORKER_STATUS_API_KEY');
    if (key !== undefined) {
      if (!/^[\x21-\x7e]{32,512}$/.test(key))
        throw new Error(
          'WORKER_STATUS_API_KEY must be 32–512 printable ASCII characters without whitespace',
        );
      this.digest = createHash('sha256').update(key).digest();
    }
  }
  canActivate(context: ExecutionContext): boolean {
    if (!this.digest)
      throw new ServiceUnavailableException(
        'Worker callbacks are not configured',
      );
    const supplied: unknown = context.switchToHttp().getRequest().headers[
      'x-ewap-worker-key'
    ];
    if (
      typeof supplied !== 'string' ||
      supplied.length > 512 ||
      !timingSafeEqual(
        this.digest,
        createHash('sha256').update(supplied).digest(),
      )
    ) {
      throw new UnauthorizedException('Invalid worker credentials');
    }
    return true;
  }
}
