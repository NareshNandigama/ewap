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
- Existing TypeScript diagnostics remain operational in source; Python does not
  replace their routes or own their database.

## Execution order

| Task | Status | Scope / completion evidence |
| --- | --- | --- |
| 1.1 FastAPI foundation | Complete | Independent `ai-service/`, health, validated evidence contract, deterministic rules; 34 Python tests and package build pass |
| 1.2 Secure NestJS integration | Pending | Service authentication, authorized evidence mapping, timeout, fallback, integration tests |
| 1.3 Docker and local verification | Pending | AI image and local API-to-Python flow |
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

Boundary trade-off: a stateless evidence snapshot preserves NestJS database and
authorization ownership; it requires an explicit mapping contract and later
network-failure handling. No public service authentication or raw-body size cap
exists yet. Keep the foundation on localhost.

Next: Task 1, Phase 2 — authenticated NestJS-to-Python integration, timeouts,
fallback, tenant-scoped evidence mapping, and integration tests. No other task
has been started. No commit, push, deployment, or paid infrastructure action was taken.

## Working rules

Implement one phase at a time. Preserve tenant isolation and existing changes.
Never delete database data or rewrite historical Prisma migrations. Explain
trade-offs and record actual test results. Commit, push, deploy, and paid cloud
actions require explicit user approval.
