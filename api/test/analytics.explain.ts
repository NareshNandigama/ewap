/** Repeatable, synthetic-only EXPLAIN comparison in the guarded local test DB. */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { Prisma, type PrismaClient } from '../src/generated/prisma/index.js';
import {
  integrationErrorsQuery,
  latestRunsQuery,
  workflowRatesQuery,
} from '../src/analytics/analytics.queries.js';
import { analyticsTestClient } from './analytics-test-db.js';

interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  Plans?: PlanNode[];
}
interface Plan {
  Plan: PlanNode;
  'Execution Time': number;
}

async function measure(db: Pick<PrismaClient, '$queryRaw'>, query: Prisma.Sql) {
  const samples: Plan[] = [];
  for (let i = 0; i < 3; i++) {
    const rows = await db.$queryRaw<{ 'QUERY PLAN': Plan[] }[]>(
      Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
    );
    samples.push(rows[0]['QUERY PLAN'][0]);
  }
  const sample = [...samples].sort(
    (a, b) => a['Execution Time'] - b['Execution Time'],
  )[1];
  const indexes = new Set<string>(),
    nodes = new Set<string>();
  function visit(node: PlanNode) {
    nodes.add(node['Node Type']);
    if (node['Index Name']) indexes.add(node['Index Name']);
    node.Plans?.forEach(visit);
  }
  visit(sample.Plan);
  return {
    medianExecutionMs: sample['Execution Time'],
    executionSamplesMs: samples.map((plan) => plan['Execution Time']),
    sharedHitBlocks: sample.Plan['Shared Hit Blocks'] ?? 0,
    sharedReadBlocks: sample.Plan['Shared Read Blocks'] ?? 0,
    indexes: [...indexes].sort(),
    nodes: [...nodes].sort(),
  };
}

describe('Synthetic PostgreSQL index comparison', () => {
  it('records SELECT plans with and without the new indexes without deleting data', async () => {
    const db = analyticsTestClient();
    const prefix = `explain-${randomUUID()}`,
      org = `${prefix}-org`,
      otherOrg = `${prefix}-other`;
    const rowCount = 100000;
    try {
      await db.$connect();
      for (const [organizationId, projectId] of [
        [org, `${prefix}-project`],
        [otherOrg, `${prefix}-other-project`],
      ]) {
        await db.organization.create({
          data: {
            id: organizationId,
            name: 'Synthetic EXPLAIN fixture',
            projects: { create: { id: projectId, name: 'Benchmark' } },
          },
        });
      }
      await db.workflow.createMany({
        data: Array.from({ length: 200 }, (_, i) => ({
          id: `${prefix}-workflow-${i}`,
          name: 'Benchmark workflow',
          projectId: i === 0 ? `${prefix}-project` : `${prefix}-other-project`,
        })),
      });
      await db.$executeRaw`
        INSERT INTO "WorkflowRun" (id, "workflowId", status, "createdAt")
        SELECT ${prefix} || '-run-' || g, ${prefix} || '-workflow-' || (g % 200),
          CASE WHEN g % 3 = 0 THEN 'FAILED' ELSE 'SUCCESS' END::"WorkflowRunStatus",
          TIMESTAMP '2026-01-01' + (g % 744) * INTERVAL '1 hour'
        FROM generate_series(1, ${rowCount}::integer) g
      `;
      await db.$executeRaw`
        INSERT INTO "IntegrationEvent" (id, "organizationId", "externalRunId", integration, workflow,
          status, "errorCode", "idempotencyKey", "occurredAt")
        SELECT ${prefix} || '-event-' || g, CASE WHEN g % 200 = 0 THEN ${org} ELSE ${otherOrg} END,
          ${prefix} || '-run-' || g, 'benchmark', 'benchmark',
          CASE WHEN g % 3 = 0 THEN 'FAILED' ELSE 'SUCCESS' END::"IntegrationEventStatus",
          CASE WHEN g % 3 = 0 THEN 'TIMEOUT' ELSE NULL END,
          ${prefix} || '-key-' || g, TIMESTAMP '2026-01-01' + (g % 744) * INTERVAL '1 hour'
        FROM generate_series(1, ${rowCount}::integer) g
      `;
      // ANALYZE updates planner statistics; it does not change application rows.
      await db.$executeRaw`ANALYZE "Project"`;
      await db.$executeRaw`ANALYZE "Workflow"`;
      await db.$executeRaw`ANALYZE "WorkflowRun"`;
      await db.$executeRaw`ANALYZE "IntegrationEvent"`;
      const window = {
        from: '2026-01-01T00:00:00Z',
        to: '2026-02-01T00:00:00Z',
        limit: 50,
      };
      const queries = {
        rates: workflowRatesQuery(org, window),
        topFailing: workflowRatesQuery(org, window, true),
        latestRuns: latestRunsQuery(org, window),
        integrationErrors: integrationErrorsQuery(org, window),
      };
      type Measurements = Record<string, Awaited<ReturnType<typeof measure>>>;
      const before: Measurements = {},
        after: Measurements = {};
      const rollback = new Error(
        'Restore all indexes by rolling back benchmark DDL',
      );
      try {
        await db.$transaction(
          async (tx) => {
            // Only these new indexes, only inside a rolled-back transaction, only
            // in the explicitly guarded isolated DB. No DROP TABLE/TRUNCATE/DELETE.
            await tx.$executeRaw`DROP INDEX "Project_organizationId_id_idx"`;
            await tx.$executeRaw`DROP INDEX "Workflow_projectId_id_idx"`;
            await tx.$executeRaw`DROP INDEX "WorkflowRun_workflowId_createdAt_id_idx"`;
            for (const [name, query] of Object.entries(queries))
              before[name] = await measure(tx, query);
            throw rollback;
          },
          { timeout: 60000 },
        );
      } catch (error) {
        if (error !== rollback) throw error;
      }
      for (const [name, query] of Object.entries(queries))
        after[name] = await measure(db, query);
      const version = await db.$queryRaw<
        { version: string }[]
      >`SELECT version()`;
      const totals = await db.$queryRaw<{ runs: number; events: number }[]>`
        SELECT (SELECT COUNT(*)::integer FROM "WorkflowRun") AS runs,
          (SELECT COUNT(*)::integer FROM "IntegrationEvent") AS events
      `;
      const artifact = {
        generatedAt: new Date().toISOString(),
        postgres: version[0].version,
        dataset: {
          totalDatabaseWorkflowRuns: totals[0].runs,
          totalDatabaseIntegrationEvents: totals[0].events,
          newWorkflowRuns: rowCount,
          newIntegrationEvents: rowCount,
          newWorkflows: 200,
          selectedTenantWorkflowCount: 1,
          selectedTenantRunCount: 500,
        },
        method:
          'Three samples per query; median shown. Baseline temporarily omits only the three new indexes in a rolled-back transaction. Cached local synthetic data; not a production SLA.',
        before,
        after,
      };
      writeFileSync(
        new URL('../../docs/analytics-explain-results.json', import.meta.url),
        JSON.stringify(artifact, null, 2) + '\n',
      );
      console.log(
        JSON.stringify({ dataset: artifact.dataset, before, after }, null, 2),
      );
      expect(
        Object.values(after).some((plan) =>
          plan.indexes.includes('WorkflowRun_workflowId_createdAt_id_idx'),
        ),
      ).toBe(true);
      const indexes = await db.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
          AND indexname = 'WorkflowRun_workflowId_createdAt_id_idx'
      `;
      expect(indexes).toHaveLength(1);
    } finally {
      await db.$disconnect();
    }
  });
});
