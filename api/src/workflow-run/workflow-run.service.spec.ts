import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { MessagingService } from '../messaging/messaging.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { WorkflowRunService } from './workflow-run.service.js';

describe('WorkflowRunService', () => {
  let service: WorkflowRunService;
  let prisma: {
    workflowRun: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
  let redis: {
    isAvailable: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    flushPattern: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      workflowRun: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
    };

    redis = {
      isAvailable: vi.fn(() => true),
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      flushPattern: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowRunService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: MessagingService,
          useValue: { publishWorkflowRun: vi.fn() },
        },
        {
          provide: RedisService,
          useValue: redis,
        },
      ],
    }).compile();

    service = module.get<WorkflowRunService>(WorkflowRunService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('ignores old cached snapshots and loads current tenant-scoped rows', async () => {
    redis.get.mockResolvedValue([{ id: 'run-1', status: 'PENDING' }]);
    prisma.workflowRun.findMany.mockResolvedValue([
      { id: 'run-1', status: 'SUCCESS' },
    ]);
    await expect(service.findAll('org-1')).resolves.toEqual([
      { id: 'run-1', status: 'SUCCESS' },
    ]);
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(prisma.workflowRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workflow: { project: { organizationId: 'org-1' } } },
      }),
    );
  });
  it('falls back cleanly when Redis is unavailable', async () => {
    const rows = [{ id: 'run-1' }];
    redis.isAvailable.mockReturnValue(false);
    prisma.workflowRun.findMany.mockResolvedValue(rows);

    await expect(service.findAll('org-1')).resolves.toEqual(rows);
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('invalidates cached workflow-run data for a run status update', async () => {
    prisma.workflowRun.findUnique.mockResolvedValue({
      workflow: {
        project: {
          organizationId: 'org-1',
        },
      },
    });
    redis.del.mockResolvedValue(true);
    redis.flushPattern.mockResolvedValue(2);

    await service.invalidateRunCaches('run-1');

    expect(redis.del).toHaveBeenCalledWith('org:org-1:workflow-runs:run:run-1');
    expect(redis.flushPattern).toHaveBeenCalledWith(
      'org:org-1:workflow-runs:*',
    );
  });
});
