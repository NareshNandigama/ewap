import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowConsumerController } from './workflow-consumer.controller.js';

describe('WorkflowConsumerController', () => {
  let controller: WorkflowConsumerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowConsumerController],
    }).compile();

    controller = module.get<WorkflowConsumerController>(WorkflowConsumerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
