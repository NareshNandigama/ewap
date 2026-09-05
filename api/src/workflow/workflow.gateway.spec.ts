import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowGateway } from './workflow.gateway.js';

describe('WorkflowGateway', () => {
  let gateway: WorkflowGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkflowGateway],
    }).compile();

    gateway = module.get<WorkflowGateway>(WorkflowGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
