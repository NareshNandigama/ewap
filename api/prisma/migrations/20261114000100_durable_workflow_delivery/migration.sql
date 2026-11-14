ALTER TABLE "WorkflowRun"
 ADD COLUMN "idempotencyKey" TEXT,
 ADD COLUMN "dispatchEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "executionToken" TEXT,
 ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
 ADD COLUMN "executionRetry" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "statusVersion" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "WorkflowRun_idempotencyKey_key" ON "WorkflowRun"("idempotencyKey");
CREATE TABLE "WorkflowOutbox" (
 "id" TEXT NOT NULL PRIMARY KEY, "key" TEXT NOT NULL UNIQUE,
 "kind" TEXT NOT NULL, "runId" TEXT NOT NULL, "workflowId" TEXT NOT NULL,
 "status" TEXT, "retryCount" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "deliveredAt" TIMESTAMP(3), "leaseToken" TEXT, "leasedUntil" TIMESTAMP(3)
);
CREATE INDEX "WorkflowOutbox_kind_deliveredAt_availableAt_idx" ON "WorkflowOutbox"("kind", "deliveredAt", "availableAt");
CREATE INDEX "WorkflowRun_leaseExpiresAt_idx" ON "WorkflowRun"("leaseExpiresAt");
