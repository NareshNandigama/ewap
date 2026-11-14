import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  let service: PrismaService;

  afterEach(() => vi.unstubAllEnvs());
  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'postgresql://test:synthetic@localhost/test');
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
