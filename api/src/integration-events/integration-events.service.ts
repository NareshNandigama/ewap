import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  EVENT_STATUSES,
  type CreateIntegrationEventDto,
} from './integration-events.dto.js';

@Injectable()
export class IntegrationEventsService {
  constructor(private readonly prisma: PrismaService) {}

  private required(value: unknown, name: string, max = 200): string {
    if (typeof value !== 'string' || !value.trim() || value.length > max) {
      throw new BadRequestException(`${name} must be a non-empty string (max ${max} characters)`);
    }
    return value.trim();
  }

  private optional(value: unknown, name: string, max = 500): string | undefined {
    if (value === undefined || value === null) return undefined;
    return this.required(value, name, max);
  }

  private validate(body: CreateIntegrationEventDto) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('A JSON object is required');
    }
    const externalRunId = this.required(body.externalRunId, 'externalRunId');
    const integration = this.required(body.integration, 'integration', 100);
    const workflow = this.required(body.workflow, 'workflow', 100);
    const idempotencyKey = this.required(body.idempotencyKey, 'idempotencyKey');
    const stage = this.optional(body.stage, 'stage');
    const errorCode = this.optional(body.errorCode, 'errorCode', 100);
    // The producer must redact secrets and personal information before sending errors.
    // Avoid persisting arbitrary payloads or stack traces in this first version.
    const errorMessage = this.optional(body.errorMessage, 'errorMessage', 1000);
    const correlationId = this.optional(body.correlationId, 'correlationId');
    const workflowRunId = this.optional(body.workflowRunId, 'workflowRunId', 100);
    if (!EVENT_STATUSES.includes(body.status)) {
      throw new BadRequestException(`status must be one of: ${EVENT_STATUSES.join(', ')}`);
    }
    if (body.retryable !== undefined && typeof body.retryable !== 'boolean') {
      throw new BadRequestException('retryable must be a boolean');
    }
    if (typeof body.occurredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(body.occurredAt)) {
      throw new BadRequestException('occurredAt must be an ISO 8601 timestamp');
    }
    const occurredAt = new Date(body.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('occurredAt is invalid');
    }
    if (occurredAt.getTime() > Date.now() + 5 * 60_000) {
      throw new BadRequestException('occurredAt cannot be more than 5 minutes in the future');
    }
    return {
      externalRunId, integration, workflow, idempotencyKey, stage, errorCode,
      errorMessage, correlationId, workflowRunId, occurredAt,
      status: body.status, retryable: body.retryable,
    };
  }

  async create(organizationId: string, body: CreateIntegrationEventDto) {
    if (!organizationId) throw new ForbiddenException('Organization context missing');
    const input = this.validate(body);

    if (input.workflowRunId) {
      const run = await this.prisma.workflowRun.findFirst({
        where: {
          id: input.workflowRunId,
          workflow: { project: { organizationId } },
        },
        select: { id: true },
      });
      if (!run) throw new BadRequestException('workflowRunId not found in your organization');
    }

    const data = {
      organizationId,
      externalRunId: input.externalRunId,
      integration: input.integration,
      workflow: input.workflow,
      stage: input.stage,
      status: input.status,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      retryable: input.retryable,
      correlationId: input.correlationId,
      workflowRunId: input.workflowRunId,
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt,
    };

    try {
      const event = await this.prisma.integrationEvent.create({ data });
      return { created: true, event };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.integrationEvent.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) {
          // Same key with different content is an error, not a safe duplicate.
          const same = existing.externalRunId === input.externalRunId &&
            existing.status === input.status &&
            existing.integration === input.integration &&
            existing.workflow === input.workflow &&
            existing.stage === (input.stage ?? null) &&
            existing.errorCode === (input.errorCode ?? null) &&
            existing.errorMessage === (input.errorMessage ?? null) &&
            existing.retryable === (input.retryable ?? null) &&
            existing.correlationId === (input.correlationId ?? null) &&
            existing.workflowRunId === (input.workflowRunId ?? null) &&
            existing.occurredAt.getTime() === input.occurredAt.getTime();
          if (same) return { created: false, event: existing };
          throw new ConflictException('idempotencyKey has already been used for another event');
        }
      }
      throw error;
    }
  }

  async list(organizationId: string, externalRunId: string) {
    if (!organizationId) throw new ForbiddenException('Organization context missing');
    const scopedRunId = this.required(externalRunId, 'externalRunId');
    return this.prisma.integrationEvent.findMany({
      where: { organizationId, externalRunId: scopedRunId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });
  }
}
