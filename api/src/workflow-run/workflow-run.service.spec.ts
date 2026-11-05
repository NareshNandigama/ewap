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
      },
    };

    redis = {
      isAvailable: vi.fn(() => true),
      get: vi.fn(),
      set: vi.fn(),
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

  it('returns cached workflow runs on a hit', async () => {
    const cached = [{ id: 'run-1', status: 'SUCCESS' }];
    redis.get.mockResolvedValue(cached);

    await expect(service.findAll('org-1')).resolves.toEqual(cached);
    expect(prisma.workflowRun.findMany).not.toHaveBeenCalled();
  });

  it('stores workflow-run list results in Redis on a miss', async () => {
    const rows = [{ id: 'run-1', status: 'PENDING' }];
    redis.get.mockResolvedValue(null);
    prisma.workflowRun.findMany.mockResolvedValue(rows);

    await expect(service.findAll('org-1')).resolves.toEqual(rows);
    expect(redis.set).toHaveBeenCalledWith(
      'org:org-1:workflow-runs:list',
      rows,
      60,
    );
  });

  it('stores individual run lookups in Redis', async () => {
    const run = { id: 'run-1', status: 'RUNNING', logs: [] };
    redis.get.mockResolvedValue(null);
    prisma.workflowRun.findFirst.mockResolvedValue(run);

    await expect(service.findOne('run-1', 'org-1')).resolves.toEqual(run);
    expect(redis.set).toHaveBeenCalledWith(
      'org:org-1:workflow-runs:run:run-1',
      run,
      60,
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
});
