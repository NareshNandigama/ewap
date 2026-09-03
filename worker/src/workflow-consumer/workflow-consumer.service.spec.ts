import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowConsumerService } from './workflow-consumer.service.js';

describe('WorkflowConsumerService', () => {
  let service: WorkflowConsumerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkflowConsumerService],
    }).compile();

    service = module.get<WorkflowConsumerService>(WorkflowConsumerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
