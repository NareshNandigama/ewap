# EWAP Engineering Roadmap — November 2026

This document distinguishes verified implementation from planned work. Update
it after each phase; do not infer completion from a feature name alone.

## Baseline

- Existing Next.js frontend, NestJS API, Prisma/PostgreSQL models, worker,
  Gemini/OpenAI abstraction, TypeScript LangGraph diagnostics, and tenant-scoped
  integration-event retrieval were inspected.
- Redis foundation: startup connection and typed workflow-run cache reads exist
  in commit `7edd291b`. Unit/build verification is recorded below; this does not
  establish live production Redis availability or cache correctness under every race.
- Existing TypeScript diagnostics remain available as fallback; the agent
  diagnostic route supports opt-in Python analysis without changing database ownership.

## Execution order

The architecture hardening queue below takes priority over the next pending
feature task, following the approved review. Work remains one item at a time.

| Priority | Item | Status |
| --- | --- | --- |
| P0 / H1 | Atomic organization/owner registration; protect tenant membership and user/organization reads | Complete locally; verified, not deployed |
| P1 / H2 | Authenticate worker status ingress and isolate WebSocket events by tenant | Complete locally; verified, not deployed |
| P1 / H3 | Fix environment-only API container startup and configuration validation | Pending |
| P1 / H4 | Atomic run dispatch/outbox, recoverable execution claims, independent status-event delivery | Pending |
| P1 / H5 | Confirm retry/DLQ publication before ACK; reconnect and apply backpressure | Pending |
| P2 / H6 | Bind chat conversations and writes to the authorized user/tenant/run | Pending |
| P2 / H7 | Model streaming terminal states, propagate cancellation, and bound provider work | Pending |
| P2 / H8 | Improve cache invalidation and diagnostic evidence/version freshness | Pending |
| P2 / H9 | Consolidate schema ownership, validate database TLS, readiness, and cross-replica socket fan-out | Pending |

After P0/P1 access and execution fixes, resume Task 3 rate limiting alongside
the remaining P2 work according to product impact. Task IDs 1–8 below retain
their original meaning; completed feature work is not being relabeled.

| Task | Status | Scope / completion evidence |
| --- | --- | --- |
| 1.1 FastAPI foundation | Complete | Independent `ai-service/`, health, validated evidence contract, deterministic rules; 34 Python tests and package build pass |
| 1.2 Secure NestJS integration | Complete | Service authentication, authorized evidence mapping, deadline, validation, TypeScript fallback; 45 Python and 60 targeted API tests pass |
| 1.3 Docker and local verification | Complete | Python 3.12 Docker image healthy; 5 live NestJS-to-Python checks pass, plus regression tests |
| 2 Advanced PostgreSQL | Complete | Four JWT/tenant-scoped endpoints, CTEs/LATERAL/window SQL, additive indexes, PostgreSQL correctness tests and measured EXPLAIN evidence |
| 3 Redis rate limiting | Pending | Registration/login/AI limits, tenant awareness, atomic concurrency behavior, 429/Retry-After, failure tests |
| 4 Python LangGraph / LLM diagnostics and RAG | Pending | Actual model calls, grounded structured findings, tenant-scoped runbook retrieval, evaluation and operational controls |
| 5 Complete Compose / Azure deployment | Pending | Full stack, HTTPS, persistent storage, backups, secrets, CI/CD; paid provisioning requires approval |
| 6 Claude provider | Pending | Generation, streaming, tools, cancellation, errors, mocked tests; choose ownership to avoid duplicate provider stacks |
| 7 Monorepo tooling | Pending | Evaluate pnpm/Turborepo and shared TypeScript contracts; Python remains independently manageable |
| 8 Snowflake learning component | Pending | Separate ingestion, views, CTE/window queries, Dynamic Tables, Cortex Analyst model |

Existing SQL indexes, Docker files, or TypeScript LangGraph do not imply that
the corresponding expanded roadmap task is complete.

### Task 4 implementation phases (all pending)

1. Actual Python model calls and LangGraph diagnostic orchestration with Pydantic
   structured findings, timeouts, bounded retries, and cancellation.
2. RAG ingestion: tenant-owned runbooks, source/version/access metadata, content
   hashes, chunking, replacement/deletion, and retry-safe indexing.
3. Authorized retrieval using PostgreSQL/pgvector as the initial store. Compare
   keyword, vector, and hybrid candidates against labeled cases; add reranking
   only if measured results justify its latency and complexity.
4. Combine retrieved runbook passages with authorized live workflow evidence;
   validate citation membership and claim support, preserve source versions, and
   return insufficient evidence when the cause is not established.
5. Development/held-out evaluations for retrieval and grounded answers, including
   tenant isolation, injection, missing/conflicting sources, latency, and cost.

Existing knowledge/vector schema fields are groundwork, not a verified RAG
pipeline. The deterministic Python service remains operational while these phases
are introduced. NestJS retains authorized database access; Python receives scoped
run/retrieval evidence through explicit API/tool contracts. No new database, MCP,
or multi-agent requirement is implied.

## Cross-cutting work planned

- Phase 1 contracts: validated evidence and explicit deterministic analysis mode.
- Service integration: correlation IDs, safe structured errors, timeout/fallback
  metrics, service authentication, request-size limits, cancellation behavior.
- Real LLM stage: groundedness and unsupported-claim evaluations, model latency,
  token/cost attribution, bounded input/output/retries, tenant usage controls,
  prompt-injection and sensitive-data tests. No real LLM analysis claim before
  model calls are implemented.
- Deployment: traces/logs/metrics, operational dashboards, alerts, cost budgets,
  HTTPS, secrets, backups, and verification of the complete end-to-end flow.
- Protocol plan: REST/JSON between API and Python; SSE when model streaming is
  implemented; preserve workflow WebSockets. No GraphQL or gRPC addition planned.
- MCP and multiple agents: optional, pending a demonstrated need and evaluation
  benefit. Neither is required for the first diagnostic workflow.

## Phase 1 verification

Verified November 12, 2026:

- Python 3.14.7: `.venv/bin/python -m pytest` — 34 passed.
- `.venv/bin/python -m build` — source distribution and wheel built successfully.
- `.venv/bin/python -m pip check` — no broken requirements.
- API Redis, workflow-run service, and integration diagnostic service specs —
  14 passed across 3 files, including Redis startup/failure/recovery regression tests.
- API `yarn build` with installed Node 24.20.0 — passed.
- Full API suite was not rerun in this phase; earlier work identified 15 existing
  test-scaffold dependency failures. These targeted passes do not imply a green full suite.
- One dependency warning: installed Starlette deprecates the HTTPX test-client
  adapter; tests currently pass. Revisit test transport compatibility on dependency updates.
- Tested runtime packages: FastAPI 0.162.5, Pydantic 2.14.3, Uvicorn 0.54.0.
  Python 3.12 is the declared minimum, but only installed Python 3.14 was tested.

Files added: package configuration, source contracts/rules/routes/app factory,
HTTP tests, local ignore rules, distribution manifest, service README, and this
roadmap. Root README links to the service. No existing application logic changed.

At the end of Phase 1, a stateless evidence snapshot preserved NestJS database
ownership, but service authentication and raw-body limits were still pending.
Phase 2 adds these controls. Keep local development on loopback.

## Phase 2 verification

Verified November 13, 2026. The implementation adds a fail-closed Python service-key check and
1 MiB raw-body limit. NestJS's existing JWT-protected agent endpoint first loads
tenant-scoped evidence, projects a bounded snapshot, then optionally calls Python
with a deadline and strict response checks. The existing TypeScript graph is the
fallback; it may call the configured LLM and incur existing provider costs.

The Python deadline does not bound the subsequent fallback provider request.
Shared-key authentication trusts NestJS for tenant authorization. No retries,
Docker changes, cloud deployment, or paid resources are part of this phase.
Metrics dashboards, distributed tracing, user-disconnect cancellation, key
rotation automation, and rate limiting remain later work. Generating an outgoing
request ID and logging a sanitized fallback reason do not complete observability.

Files changed:

- Python `security.py`, `body_limit.py`, app wiring, environment example, and
  security tests; existing endpoint tests now supply a test service credential.
- NestJS `PythonDiagnosticsClient`, `WorkflowDiagnosticsService`, controller/module
  wiring, configuration validation, and client/orchestration/controller tests.
- Root/service READMEs and this roadmap document the opt-in setup and limits.

Validation:

- Python `.venv/bin/python -m pytest`: 45 passed (existing Starlette test-client
  deprecation warning remains).
- API targeted Vitest run: 60 passed across 6 files. Covers authenticated-tenant
  forwarding, real tenant-scoped service lookup, response validation, deadline
  including body reads, HTTP/network failure, and the real TypeScript graph with
  a mocked model provider. HTTP transport to Python is mocked in these API tests.
- API `yarn lint`: passed; `yarn build` under Node 24.20.0: passed.
- Python `.venv/bin/python -m build`: source distribution and wheel passed.
- Full API suite was not rerun; unrelated legacy scaffold failures recorded in
  Phase 1 are not claimed resolved. The modified AI controller scaffold now passes.
- Live cross-process/Docker integration verification remains Phase 3. Tests made
  no real model calls and did not modify database data or provision cloud resources.

Phase 2 next step was Task 1, Phase 3; its verified results follow.

## Phase 3 verification

Verified November 13, 2026. New files: Python Dockerfile, Docker ignore rules, runtime dependency
pins, `compose.ai-local.yml`, and a dedicated API live test/config/script entry.
Service instructions document setup, scope, security limits, and cleanup.

The Compose project is intentionally AI-only with NestJS running on the host.
Its port is bound to loopback; the image is non-root and Compose applies a
read-only filesystem, temporary `/tmp`, capability restrictions, and resource
limits. Runtime secrets are excluded from the image build context.

Live verification uses actual NestJS/Python HTTP with fixture database reads and
a stubbed model. It does not claim real PostgreSQL coverage, actual LLM analysis,
full-stack Docker deployment, or production readiness. Task 5 owns the complete
Compose/Azure stack. No production database or cloud infrastructure is involved.

Validation results:

- `docker compose --env-file ai-service/.env.local -f compose.ai-local.yml up
  --build --wait`: image built and container became healthy.
- Runtime check: Python 3.12.16 and UID 10001; `pip check` found no broken dependencies.
- Container inspection: read-only root filesystem, 256 MiB memory limit, published
  only on `127.0.0.1:18001`.
- Dedicated `test:ai:live` config under Node 24.20.0: 5 passed, with actual Python
  container HTTP and an ephemeral JWT-protected NestJS HTTP server. Verified
  success, invalid JWT, tenant denial, missing/wrong service keys, and real
  TypeScript graph fallback using a stubbed model.
- Existing targeted API tests: 60 passed across 6 files; lint and Node 24 build passed.
- Host Python unit/HTTP tests: 45 passed on Python 3.14.7. The existing Starlette
  test-client deprecation warning remains. Python 3.12 was exercised through the
  live container checks; the full Python unit suite was not run in that image.
- Full API suite was not rerun; unrelated legacy scaffold failures remain outside
  this phase. These results do not claim all repository tests are green.
- Verification container/network stopped using Compose `down` without volume
  deletion. The locally generated credential remains in ignored `.env.local`,
  outside Git and the Docker build context. Docker Desktop was started locally;
  the built image/cache remains available for reuse.

Task 1 is complete for the scoped deterministic service. Real Python LLM analysis
is Task 4, and cloud deployment remains Task 5. Next in execution order: Task 2,
Advanced PostgreSQL analytics. No commit or push was made during this phase.

## Task 2 verification

Verified November 13, 2026. Added a NestJS Analytics module and four read-only
endpoints for top failing workflows, workflow outcome rates, latest windowed
runs, and integration error frequency. All SQL is parameterized and scoped to
the JWT organization. Validated UTC windows are half-open, at most 366 days, and
response lists are limited to 200 rows. Rates exclude active/cancelled runs from
the SUCCESS + FAILED denominator and are null when no such outcomes exist.

The queries use CTEs, joins, lateral aggregates, ROW_NUMBER, filtered aggregates,
and numeric rounding. An additive migration adds tenant/project lookup indexes
and `(workflowId, createdAt DESC, id DESC)` on WorkflowRun. Historical migrations
are unchanged. The existing IntegrationEvent indexes are reused.

Files changed include `api/src/analytics/`, schema/new migration, AppModule,
unit/safety/PostgreSQL HTTP tests, guarded local runner/config/package commands,
isolated PostgreSQL Compose, [analytics documentation](analytics.md), root README,
and [the EXPLAIN measurement artifact](analytics-explain-results.json).

Validation:

- 15 real PostgreSQL/NestJS HTTP tests passed on PostgreSQL 16.16. They verify
  rate denominators, zero-run/null results, inclusive/exclusive boundaries,
  deterministic latest-run ties, failed-event grouping, safe tenant parameters,
  cross-tenant isolation, JWT rejection, query validation, and result limits.
- EXPLAIN comparison passed using 100,000 newly seeded runs and 100,000 newly
  seeded events per run. The recorded database contains 200,030 runs and 200,026
  events after two benchmark iterations and fixture tests; no data was removed.
- Final workflow-query medians changed from 36.5–39.8 ms without the new indexes
  to 1.0–1.2 ms with them. The existing event index already served the error query;
  no improvement is claimed there. Cached selective-tenant fixture results are
  not production performance guarantees.
- Targeted unit/regression and database-safety tests: 81 passed across 8 files.
- Prisma schema validation, API lint, and Node 24 build passed.
- All 14 migrations were applied only to the fresh isolated `ewap_analytics_test`
  database. Production/application migrations were not run. The runner rejects
  non-loopback hosts, other database/user names, and connection-option overrides.
- Baseline comparison temporarily removes only the three new indexes inside a
  deliberately rolled-back test transaction, then measures them restored. No
  tables/rows are reset, truncated, or deleted. Named-volume fixture data remains.
- Full API suite was not rerun; legacy scaffold failures remain outside this task.

The isolated database container/network is stopped after verification with its
named volume preserved. No cloud deployment or paid infrastructure was created.
This task intentionally leaves the frontend unchanged. Next: Task 3, Redis-backed
login/AI rate limiting, tenant-aware quotas, 429/Retry-After, and failure/concurrency tests.

## H1 membership authorization verification

Implemented November 13, 2026, following approval to prioritize the architecture
findings. Public registration now atomically creates a new organization and its
first ADMIN. Existing-tenant membership creation and directory access require a
current same-tenant ADMIN; new managed accounts are always MEMBER. Members can
read their own profile and organization. Public organization/user enumeration and
the orphan-organization creation route have been removed.

JWT identity claims are validated before tenant lookups. Privileged user operations
revalidate the current role in PostgreSQL, including inside a serializable write
transaction. Public demo access cannot issue ADMIN credentials. New passwords
are bounded by bcrypt's UTF-8 byte limit. Existing users, organizations, and
password hashes are unchanged; there are no schema/migration changes.

Changed files cover Auth/User/Organization controllers, services, DTOs/module
wiring, JWT guard, public-user projection, password helper, unit tests, and a
real PostgreSQL HTTP/concurrency test plus guarded runner command/config. The
[API contract and rollout notes](membership-authorization.md) describe the removed
legacy bootstrap flow and current permissions.

Validation: 109 targeted unit/regression tests passed across 16 files, 19 real
PostgreSQL membership HTTP tests passed (including concurrent duplicate signup),
and the existing 15 analytics PostgreSQL/HTTP tests passed with the stricter JWT
guard. API lint and the Node 24 build passed. No production deployment or schema
migration was performed. The full API suite was not rerun; remaining unrelated
legacy scaffold failures are not claimed resolved. The touched Auth/User/Organization
and JWT scaffolds were replaced with meaningful tests.

Only synthetic fixtures are added to the existing isolated test database; no application data is
modified or reset. Its test container/network was stopped with the named volume
preserved. Email invitations, verification, session revocation, and
password-reset flows remain separate work. Public registration rate protection
joins the planned Task 3 scope. Next implementation item: H2, authenticated worker
status callbacks and tenant-scoped WebSocket delivery.

## H2 workflow status boundary verification

Implemented November 13, 2026. Worker notifications require a separate server key;
the callback derives tenant and status from PostgreSQL, invalidates exact cache
keys before emitting, and rechecks persisted state. Socket.IO validates JWT and
current membership, assigns the tenant room server-side, and disconnects expired
sessions. The frontend supplies fresh access credentials on connection/reconnect.

The worker validates callback configuration at startup and uses an authenticated,
bounded, no-redirect HTTP client. Callback delivery failure no longer overwrites a
successful execution or throws into initial RUNNING notification handling. This
addresses the notification-error coupling observed in H4, but durable delivery,
outbox, leases/attempt recovery, and broker confirms remain pending H4/H5 work.

Changed files: API worker guard/status controller/service/module and gateway,
worker status client/execution wiring, frontend update hook, unit/live tests,
guarded test command/config, and [status protocol documentation](workflow-status-security.md).
RAG is now an explicit set of pending Task 4 phases; no RAG implementation was
started in this hardening item.

Validation:

- 126 targeted API unit/regression tests passed across 19 files, plus the existing
  4 integration-diagnostics tests (130 tests across 20 files in total).
- 18 targeted worker tests passed, including callback timeout/error handling and
  preserving SUCCESS when notification delivery fails.
- 12 live PostgreSQL/HTTP/Socket.IO tests passed: credentials, current membership,
  token expiry, tenant isolation, room spoofing, stale states, input validation,
  and cache-invalidation failure. Redis operations were stubbed; sockets and
  database lookups were real. No RabbitMQ execution or LLM calls were made.
- API and worker Node 24 builds passed. API/worker lint passed; worker lint retains
  two pre-existing unused-variable warnings in unrelated files. Frontend hook lint passed.
- Frontend production build and TypeScript checks passed using `yarn build --webpack`.
  Default Turbopack build failed on a local compiler subprocess port restriction,
  including a retry with sandbox escalation. No compiler/config change was made.
- Full API/worker suites and global frontend lint were not rerun; unrelated legacy
  scaffold failures are not claimed resolved. No schema or migration changed.

The isolated test database contains only additional synthetic fixtures. Its
container/network is stopped afterward without deleting the named volume. No
application database, production deployment, or paid infrastructure was modified.
Single-process socket delivery and cache fill/recovery races remain documented
limits. Next priority: H3, environment-only API startup/configuration validation.

## Engineering acceptance criteria

Apply these criteria within the existing task order. Planned evaluations and
experiments remain pending until implemented and verified.

- For each implemented phase, document the request flow, trust boundaries,
  architectural trade-offs, reproducible checks, and remaining limitations.
- Task 3: connect rate/concurrency controls to resource exhaustion and provider
  cost protection. A request quota alone is not a spending cap or concurrency limit.
- Task 4: separate observed facts, hypotheses, and insufficient evidence. Validate
  structured outputs and allowed evidence references; citation membership alone
  does not prove that a claim is supported. Version prompts/model configurations.
- Evaluation: plan a 30-case development baseline (8 answerable, 5 absent
  answers, 5 paraphrase/exact-ID, 4 stale/conflicting, 4 cross-tenant, 4 injection/tool
  misuse), with a separate held-out set and a human-reviewed scoring rubric. These
  cases are proposed, not implemented, and are not proof of production reliability.
- If retrieval is added or extended, first inspect its actual implementation.
  Preserve source/version/access provenance and document lifecycle; compare exact,
  vector, and hybrid retrieval only where useful. Keep live run state in authorized
  database/API reads. Retrieval quality and grounded-answer quality are separate
  measurements. Scope retrieval experiments separately before implementation.
- Streaming/provider work: distinguish provisional output from validated final
  answers; design completed/failed/cancelled persistence and cancellation propagation.
  Do not claim provider work or billing stopped solely because a client disconnected.
- Operations: measure stage latency, p50/p95, tokens, retries, failures/cancellations,
  and cost per successful request with explicit denominators. Record only measured
  values; retain reproducible synthetic failure traces and known limitations.
- Tools/MCP/agents: prefer narrow read-only tools and a bounded code-defined flow.
  Model-proposed actions still need server authorization. MCP, multi-agent work,
  fine-tuning, and additional frameworks require a demonstrated need and measured
  benefit before adoption.

The current Python service is deterministic; its unit tests are not LLM quality
evaluations. PostgreSQL EXPLAIN measurements are database experiments, not AI
quality or end-to-end production latency measurements. The hardening queue now
determines the immediate next implementation item.

## Working rules

The [architecture review](architecture-review.md) records pending access-control,
workflow delivery/state, container startup, chat, streaming, and cache findings.
Completed feature tasks do not imply these broader architecture gaps are fixed.
The approved priority is to address membership and status-channel trust boundaries
before expanding functionality. The review itself made no application fixes;
hardening implementation and verification are tracked separately in the queue.

Implement one phase at a time. Preserve tenant isolation and existing changes.
Never delete database data or rewrite historical Prisma migrations. Explain
trade-offs and record actual test results. Commit, push, deploy, and paid cloud
actions require explicit user approval.
