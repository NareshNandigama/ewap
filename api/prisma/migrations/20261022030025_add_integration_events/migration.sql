-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('STARTED', 'RUNNING', 'SUCCESS', 'FAILED', 'RETRYING', 'CANCELLED');

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowRunId" TEXT,
    "externalRunId" TEXT NOT NULL,
    "integration" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "stage" TEXT,
    "status" "IntegrationEventStatus" NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "retryable" BOOLEAN,
    "correlationId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationEvent_organizationId_occurredAt_idx" ON "IntegrationEvent"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_organizationId_externalRunId_idx" ON "IntegrationEvent"("organizationId", "externalRunId");

-- CreateIndex
CREATE INDEX "IntegrationEvent_organizationId_correlationId_idx" ON "IntegrationEvent"("organizationId", "correlationId");

-- CreateIndex
CREATE INDEX "IntegrationEvent_workflowRunId_idx" ON "IntegrationEvent"("workflowRunId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_organizationId_idempotencyKey_key" ON "IntegrationEvent"("organizationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
