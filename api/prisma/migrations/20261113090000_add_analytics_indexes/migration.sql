-- New indexes only. Historical migrations and application data are unchanged.
CREATE INDEX "Project_organizationId_id_idx" ON "Project"("organizationId", "id");
CREATE INDEX "Workflow_projectId_id_idx" ON "Workflow"("projectId", "id");
CREATE INDEX "WorkflowRun_workflowId_createdAt_id_idx"
  ON "WorkflowRun"("workflowId", "createdAt" DESC, "id" DESC);
