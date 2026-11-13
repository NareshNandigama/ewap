import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { WorkflowGateway } from '../workflow/workflow.gateway.js';
import { WorkflowStatusDto } from './dto/workflow-status.dto.js';

@Injectable()
export class WorkflowStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gateway: WorkflowGateway,
  ) {}

  private async loadRun(id: string) {
    const run = await this.prisma.workflowRun.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        workflowId: true,
        workflow: { select: { project: { select: { organizationId: true } } } },
      },
    });
    if (!run) throw new NotFoundException('Workflow run not found');
    return run;
  }

  async notify(input: WorkflowStatusDto) {
    const run = await this.loadRun(input.runId);
    if (run.status !== input.status)
      throw new ConflictException('Stale workflow status notification');
    const organizationId = run.workflow.project.organizationId;
    if (this.redis.isAvailable()) {
      const results = await Promise.all([
        this.redis.del(`org:${organizationId}:workflow-runs:run:${run.id}`),
        this.redis.del(`org:${organizationId}:workflow-runs:list`),
        this.redis.del(
          `org:${organizationId}:workflows:${run.workflowId}:workflow-runs:list`,
        ),
      ]);
      if (results.some((deleted) => !deleted))
        throw new ServiceUnavailableException(
          'Status cache invalidation failed',
        );
    }
    // Avoid emitting a status which changed while cache invalidation was pending.
    // This is a notification hint, not an atomic event log or an execution attempt ID.
    const current = await this.loadRun(input.runId);
    if (
      current.status !== input.status ||
      current.workflowId !== run.workflowId ||
      current.workflow.project.organizationId !== organizationId
    ) {
      throw new ConflictException('Stale workflow status notification');
    }
    this.gateway.broadcastWorkflowStatus(
      organizationId,
      current.id,
      current.status,
    );
    return { success: true };
  }
}
