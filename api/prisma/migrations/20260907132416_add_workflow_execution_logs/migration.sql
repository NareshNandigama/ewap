-- CreateEnum
CREATE TYPE "ExecutionLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR', 'SUCCESS');

-- CreateTable
CREATE TABLE "WorkflowExecutionLog" (
    "id" TEXT NOT NULL,
    "workflowRunId" TEXT NOT NULL,
    "level" "ExecutionLogLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowExecutionLog_workflowRunId_createdAt_idx" ON "WorkflowExecutionLog"("workflowRunId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkflowExecutionLog" ADD CONSTRAINT "WorkflowExecutionLog_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
