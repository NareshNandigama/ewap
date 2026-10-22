export const EVENT_STATUSES = [
  'STARTED', 'RUNNING', 'SUCCESS', 'FAILED', 'RETRYING', 'CANCELLED',
] as const;

export type IntegrationEventStatusInput = (typeof EVENT_STATUSES)[number];

export interface CreateIntegrationEventDto {
  externalRunId: string;
  integration: string;
  workflow: string;
  stage?: string;
  status: IntegrationEventStatusInput;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  correlationId?: string;
  idempotencyKey: string;
  occurredAt: string;
  workflowRunId?: string;
}

export interface DiagnoseIntegrationDto {
  externalRunId: string;
  question: string;
}
