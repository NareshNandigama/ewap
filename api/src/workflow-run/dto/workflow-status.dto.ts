import { IsIn, IsString, IsUUID } from 'class-validator';

export class WorkflowStatusDto {
  @IsUUID()
  runId: string;

  @IsString()
  @IsIn([
    'PENDING',
    'RUNNING',
    'SUCCESS',
    'FAILED',
    'CANCELLED',
  ])
  status: string;
}