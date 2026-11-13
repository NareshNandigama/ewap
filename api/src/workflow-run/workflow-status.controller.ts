import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { WorkflowStatusDto } from './dto/workflow-status.dto.js';
import { WorkflowStatusService } from './workflow-status.service.js';
import { WorkerStatusGuard } from './worker-status.guard.js';

@Controller('workflow-runs/status')
@UseGuards(WorkerStatusGuard)
export class WorkflowStatusController {
  constructor(private readonly status: WorkflowStatusService) {}
  @Post()
  @HttpCode(200)
  notify(@Body() dto: WorkflowStatusDto) {
    return this.status.notify(dto);
  }
}
