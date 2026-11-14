import { Prisma } from '../generated/prisma/index.js';

export interface AnalyticsWindow {
  from: string;
  to: string;
  limit: number;
}

const scopedWorkflows = (organizationId: string) => Prisma.sql`
  SELECT w.id AS "workflowId", w.name AS "workflowName",
         p.id AS "projectId", p.name AS "projectName"
  FROM "Workflow" w JOIN "Project" p ON p.id = w."projectId"
  WHERE p."organizationId" = ${organizationId}
`;

export function workflowRatesQuery(
  organizationId: string,
  window: AnalyticsWindow,
  failingOnly = false,
) {
  return Prisma.sql`
    WITH scoped_workflows AS (${scopedWorkflows(organizationId)}),
    counts AS (
      SELECT w.*, c.*
      FROM scoped_workflows w CROSS JOIN LATERAL (
      SELECT
        COUNT(r.id)::integer AS "totalRuns",
        (COUNT(r.id) FILTER (WHERE r.status = 'SUCCESS'))::integer AS "successCount",
        (COUNT(r.id) FILTER (WHERE r.status = 'FAILED'))::integer AS "failureCount",
        (COUNT(r.id) FILTER (WHERE r.status = 'CANCELLED'))::integer AS "cancelledCount",
        (COUNT(r.id) FILTER (WHERE r.status IN ('PENDING', 'RUNNING')))::integer AS "activeCount"
      FROM "WorkflowRun" r WHERE r."workflowId" = w."workflowId"
        AND r."createdAt" >= (${window.from}::timestamptz AT TIME ZONE 'UTC')
        AND r."createdAt" < (${window.to}::timestamptz AT TIME ZONE 'UTC')
      ) c
    ), rates AS (
      SELECT *, ("successCount" + "failureCount") AS "completedRuns",
        ROUND(100.0 * "successCount" / NULLIF("successCount" + "failureCount", 0), 2)::double precision AS "successRate",
        ROUND(100.0 * "failureCount" / NULLIF("successCount" + "failureCount", 0), 2)::double precision AS "failureRate"
      FROM counts
    )
    SELECT * FROM rates
    ${failingOnly ? Prisma.sql`WHERE "failureCount" > 0 ORDER BY "failureCount" DESC, "failureRate" DESC, "workflowId" ASC` : Prisma.sql`ORDER BY "workflowId" ASC`}
    LIMIT ${window.limit}
  `;
}

export function latestRunsQuery(
  organizationId: string,
  window: AnalyticsWindow,
) {
  return Prisma.sql`
    WITH scoped_workflows AS (${scopedWorkflows(organizationId)})
    SELECT w.*, r.id AS "runId", r.status, r."createdAt", r."completedAt"
    FROM scoped_workflows w LEFT JOIN LATERAL (
      SELECT r.id, r.status, r."createdAt", r."completedAt", ROW_NUMBER() OVER (
        PARTITION BY r."workflowId" ORDER BY r."createdAt" DESC, r.id DESC
      ) AS position
      FROM "WorkflowRun" r
      WHERE r."workflowId" = w."workflowId"
        AND r."createdAt" >= (${window.from}::timestamptz AT TIME ZONE 'UTC')
        AND r."createdAt" < (${window.to}::timestamptz AT TIME ZONE 'UTC')
    ) r ON r.position = 1
    ORDER BY w."workflowId" ASC LIMIT ${window.limit}
  `;
}

export function integrationErrorsQuery(
  organizationId: string,
  window: AnalyticsWindow,
) {
  return Prisma.sql`
    WITH scoped_events AS (
      SELECT integration, "errorCode", status, "occurredAt"
      FROM "IntegrationEvent"
      WHERE "organizationId" = ${organizationId}
        AND "occurredAt" >= (${window.from}::timestamptz AT TIME ZONE 'UTC')
        AND "occurredAt" < (${window.to}::timestamptz AT TIME ZONE 'UTC')
    ), totals AS (
      SELECT integration, COUNT(*)::integer AS "totalEvents"
      FROM scoped_events GROUP BY integration
    ), failures AS (
      SELECT integration, "errorCode", COUNT(*)::integer AS "failureCount",
        MIN("occurredAt") AS "firstFailureAt", MAX("occurredAt") AS "latestFailureAt"
      FROM scoped_events WHERE status = 'FAILED' GROUP BY integration, "errorCode"
    )
    SELECT f.*, t."totalEvents",
      ROUND(100.0 * f."failureCount" / t."totalEvents", 2)::double precision AS "frequencyPercent"
    FROM failures f JOIN totals t USING (integration)
    ORDER BY f."failureCount" DESC, f.integration ASC, f."errorCode" ASC NULLS LAST
    LIMIT ${window.limit}
  `;
}
