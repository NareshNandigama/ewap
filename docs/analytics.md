# PostgreSQL analytics

Task 2 adds read-only, organization-scoped NestJS analytics backed by the existing
Prisma/PostgreSQL schema. It adds no separate data warehouse, cache, or tables.

## HTTP contract

All endpoints require the existing Bearer JWT and support ADMIN and MEMBER users
within their organization. Organization context comes from the verified JWT;
an `organizationId` query parameter cannot select another tenant.

| GET route (after `/api/v1`) | Meaning |
| --- | --- |
| `/analytics/workflows/top-failing` | Workflows with failures, ordered by failure count descending, then failure rate descending, then workflow ID |
| `/analytics/workflows/rates` | Counts and success/failure percentages for every tenant workflow, including workflows with zero matching runs |
| `/analytics/workflows/latest-runs` | Latest run **inside the requested window** for each workflow; nullable run fields when none match |
| `/analytics/integrations/errors` | Failed integration events grouped by integration and error code |

Common query parameters:

- `from`: timezone-qualified ISO 8601 timestamp, inclusive.
- `to`: timezone-qualified ISO 8601 timestamp, exclusive; defaults to request time.
- Omitted `from` means 30 days before `to`.
- Windows must be positive and no longer than 366 days.
- `limit`: integer 1–200; defaults to 50. This is a bounded result list, not
  pagination or a limit on the number of underlying rows aggregated.

Every response has `{ from, to, limit, items }`. Timestamps are normalized to UTC.
Invalid parameters return HTTP 400; missing organization context returns 403;
missing/invalid JWT returns 401. Valid tenants with no matching data receive an
empty list (rates/latest still include their existing workflows with zero/null data).

```sh
curl --fail-with-body \
  'http://localhost:3000/api/v1/analytics/workflows/top-failing?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z&limit=10' \
  -H "Authorization: Bearer $EWAP_ACCESS_TOKEN"
```

Workflow count/rate fields:

- `totalRuns` counts all statuses by run `createdAt`, not `completedAt`.
- `successCount`, `failureCount`, `cancelledCount`, and `activeCount` partition
  that total; active means PENDING or RUNNING.
- `completedRuns` is specifically SUCCESS + FAILED for the rate denominator.
- `successRate` and `failureRate` are percentages rounded to two decimals.
  They are `null` when the denominator is zero; a pending workflow is not 0% successful.
- Latest-run ties use descending `createdAt`, then descending run ID. Run fields
  are flattened as `runId`, `status`, `createdAt`, and `completedAt`.
- Workflow results include workflow and project IDs/names. Rates/latest are
  ordered by workflow ID; no names, logs, or records from other tenants are joined.

Integration frequency semantics:

- Only FAILED events contribute to `failureCount`; RETRYING is not itself a failure.
- `totalEvents` counts **all statuses for that integration** within the same
  organization/time window. `frequencyPercent` is a failed-code count divided by
  this total, rather than a workflow-run failure rate.
- An execution may emit multiple events. These are event frequencies, not distinct
  failed-run counts. Ingestion already handles idempotency keys.
- Missing `errorCode` is returned as `null`, distinct from a literal `UNSPECIFIED` code.
- Includes first/latest failure timestamps. It does not expose error messages or
  arbitrary payloads. Time filtering uses `occurredAt`.

## SQL and index design

`api/src/analytics/analytics.queries.ts` is the single source for endpoint SQL and
EXPLAIN measurements. It uses Prisma tagged SQL parameters for tenant IDs, dates,
and limits. No caller-controlled string is interpolated into SQL syntax.

CTEs establish tenant-scoped workflows/events, aggregate counts, and calculate
rates. `FILTER`, `NULLIF`, and numeric rounding handle statuses and zero denominators.
Per-workflow `LATERAL` lookups keep the run access path correlated with the scoped
workflow. Latest runs use `ROW_NUMBER()` partitioned by workflow with a stable
time/ID order. These are database joins, not separate network calls per workflow.

The additive migration `20261113090000_add_analytics_indexes` adds:

- Project `(organizationId, id)` for tenant lookup.
- Workflow `(projectId, id)` for the next hierarchy join.
- WorkflowRun `(workflowId, createdAt DESC, id DESC)` for run window/order access.

No extra IntegrationEvent index is added: existing organization-leading indexes
already serve the scoped event query in this fixture. PostgreSQL can choose a
sequential scan for small dimension tables; the presence of an index does not
guarantee its use. Leading-column predicates matter for multicolumn B-trees.
[PostgreSQL multicolumn indexes](https://www.postgresql.org/docs/16/indexes-multicolumn.html).

The migration was applied only to the isolated local test database. It has not
been deployed to the application database. Standard `CREATE INDEX` can block
writes while building; review an appropriate deployment window or a separate
concurrent-index rollout for large production tables. No historical migration was changed.

## Reproduce database tests safely

Requires Docker Desktop, installed API dependencies, and Node 24. The pgvector
image is used because an existing historical migration requires the vector extension.

From the repository root, create `.env.analytics-local` once (never overwrite an
existing file when reusing its persisted database). The generated secret is not
committed or printed:

```sh
python3 - <<'PY'
import os, secrets
password = secrets.token_hex(32)
fd = os.open('.env.analytics-local', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as file:
    file.write(f'ANALYTICS_TEST_PASSWORD={password}\n')
    file.write(f'ANALYTICS_TEST_DATABASE_URL=postgresql://analytics_owner:{password}@127.0.0.1:15432/ewap_analytics_test\n')
PY
docker compose --env-file .env.analytics-local -f compose.analytics-local.yml up -d --wait
cd api
yarn analytics:migrate:local
yarn test:analytics:db
yarn analytics:explain
```

The runner loads only `.env.analytics-local` and refuses a non-loopback host, a
different database name, or a different username before spawning migration/tests.
Query strings and fragments are rejected, preventing connection-option overrides.
It explicitly passes this URL as DATABASE_URL, so Prisma's normal `.env` loader
does not override it. No application database URL is read for these commands.
Use the dedicated Compose database; the name/host checks supplement this
isolation, but are not a substitute for supplying the correct local environment.

Tests insert unique synthetic fixtures and never reset, truncate, or delete rows.
Repeated runs append fixtures; only their unique tenant IDs are queried. EXPLAIN
adds 100,000 runs, 100,000 events, and 200 workflows per execution. The named volume
is preserved, so keep the local secret file for subsequent starts.

The HTTP tests use a real NestJS server, JWT guard, validation, Prisma adapter,
and PostgreSQL queries; there is no fake SQL engine or LLM dependency.

After testing, from the repository root:

```sh
docker compose --env-file .env.analytics-local -f compose.analytics-local.yml down
```

No volume deletion flag is used. Application database data and unrelated Compose
projects are not affected.

## EXPLAIN evidence and limits

The committed [measurement artifact](analytics-explain-results.json) records
PostgreSQL version, fixture and total database sizes, three timing samples per
query, their median, buffer counts, chosen indexes, and plan node types.
The comparison uses the **same final query** before/after the new indexes.
Rerunning `analytics:explain` replaces this artifact with the new local measurements.

Recorded November 13, 2026 on PostgreSQL 16.16, with 200,030 total runs and
200,026 total events accumulated in the isolated database. The measured tenant
had one workflow and 500 runs; three samples were taken per query:

| Query | Without new indexes (median ms) | With new indexes (median ms) |
| --- | ---: | ---: |
| Workflow rates | 36.547 | 1.200 |
| Top failing workflows | 39.711 | 1.045 |
| Latest workflow runs | 39.771 | 1.032 |
| Integration error frequency | 1.230 | 1.685 |

The workflow queries used `WorkflowRun_workflowId_createdAt_id_idx`; their root
shared-buffer hits fell from about 4,000 to 526–606. The integration query used
the existing organization-leading correlation-ID index in both plans, with the
same 503 buffer hits; these samples show no improvement from the new indexes
for that query. Dimension tables were small enough that sequential scans could
remain preferable. The initial broad-join query shape did not consistently use
the run index; correlated `LATERAL` access resolved that in this fixture.

For the baseline, only the three new indexes are temporarily dropped inside an
explicit test-only transaction. That transaction is deliberately rolled back,
restoring the indexes before the indexed measurement. No rows are removed.
`ANALYZE` refreshes statistics before measurement. EXPLAIN ANALYZE actually executes
the query; the measured statements are SELECTs.
[PostgreSQL EXPLAIN](https://www.postgresql.org/docs/16/sql-explain.html).

This is a selective-tenant, warm-cache, local synthetic experiment, not a
production latency guarantee. Large tenants, data skew, different time windows,
concurrent traffic, and write costs require separate measurement. Rates/failures
must still aggregate all matching run rows. The three samples are informational;
tests assert correctness and index availability/use, not a fragile timing threshold.

There is no frontend analytics UI change, rate limiter, materialized view, or
analytics cache in this task. Endpoint queries use current database statements;
separate endpoint calls need not share one transactional snapshot.
