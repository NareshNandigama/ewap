import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowRunController } from './workflow-run.controller.js';

describe('WorkflowRunController', () => {
  let controller: WorkflowRunController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowRunController],
    }).compile();

    controller = module.get<WorkflowRunController>(WorkflowRunController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
