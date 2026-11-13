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

| Task | Status | Scope / completion evidence |
| --- | --- | --- |
| 1.1 FastAPI foundation | Complete | Independent `ai-service/`, health, validated evidence contract, deterministic rules; 34 Python tests and package build pass |
| 1.2 Secure NestJS integration | Complete | Service authentication, authorized evidence mapping, deadline, validation, TypeScript fallback; 45 Python and 60 targeted API tests pass |
| 1.3 Docker and local verification | Complete | Python 3.12 Docker image healthy; 5 live NestJS-to-Python checks pass, plus regression tests |
| 2 Advanced PostgreSQL | Pending | Tenant analytics, CTEs, joins, windows, indexes, EXPLAIN ANALYZE, tests |
| 3 Redis rate limiting | Pending | Login/AI limits, tenant awareness, atomic concurrency behavior, 429/Retry-After, failure tests |
| 4 Python LangGraph / LLM diagnostics | Pending | Actual model calls, grounded structured findings, retries, timeout/cancellation, evaluation fixtures |
| 5 Complete Compose / Azure deployment | Pending | Full stack, HTTPS, persistent storage, backups, secrets, CI/CD; paid provisioning requires approval |
| 6 Claude provider | Pending | Generation, streaming, tools, cancellation, errors, mocked tests; choose ownership to avoid duplicate provider stacks |
| 7 Monorepo tooling | Pending | Evaluate pnpm/Turborepo and shared TypeScript contracts; Python remains independently manageable |
| 8 Snowflake learning component | Pending | Separate ingestion, views, CTE/window queries, Dynamic Tables, Cortex Analyst model |

Existing SQL indexes, Docker files, or TypeScript LangGraph do not imply that
the corresponding expanded roadmap task is complete.

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

## Working rules

Implement one phase at a time. Preserve tenant isolation and existing changes.
Never delete database data or rewrite historical Prisma migrations. Explain
trade-offs and record actual test results. Commit, push, deploy, and paid cloud
actions require explicit user approval.
