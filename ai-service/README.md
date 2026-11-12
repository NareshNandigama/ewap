# EWAP Python Diagnostics Service

Task 1, Phase 1: a standalone FastAPI application with Pydantic v2 contracts
and deterministic workflow-run diagnostics. **No LLM calls are implemented.**

## Boundary

NestJS owns authentication, organization authorization, database reads,
conversations, and caching. This service owns diagnostic computation over an
explicit evidence snapshot. It has no database, Redis, or provider credentials.
Existing TypeScript AI endpoints remain operational and do not call Python yet.

`organizationId` is caller-supplied context, not authentication. Python cannot
verify ownership of a run or log without NestJS's authorized lookup. The service
stores no request state. Phase 2 will add service authentication, a NestJS client,
timeouts, and fallback. **Until then, use localhost only; do not publish this
unauthenticated foundation to a cloud endpoint.**

Using a snapshot preserves one database owner but introduces a contract that
NestJS will need to map explicitly. Full Prisma objects (including arbitrary
metadata) are intentionally not accepted. No migrations are needed.

## Setup and run

Python 3.12 or newer is required. From this directory:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
.venv/bin/python -m uvicorn ewap_ai.main:app --host 127.0.0.1 --port 8001
```

OpenAPI is available at `http://127.0.0.1:8001/docs`.

```sh
curl --fail http://127.0.0.1:8001/health
curl --fail-with-body http://127.0.0.1:8001/v1/diagnostics/workflow-run \
  -H 'Content-Type: application/json' \
  --data '{
    "organizationId": "org-1",
    "question": "Why did this fail?",
    "workflowRun": {
      "id": "run-1",
      "status": "FAILED",
      "logs": [{
        "id": "log-1",
        "level": "ERROR",
        "message": "Connection timed out",
        "createdAt": "2026-11-12T10:00:00Z"
      }]
    }
  }'
```

## Contract and behavior

- `GET /health` checks process health only; it does not test other services.
- `POST /v1/diagnostics/workflow-run` accepts camelCase fields.
- Required: `organizationId`, `question`, `workflowRun.id`, `workflowRun.status`.
- Status: `PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, or `CANCELLED`.
- Logs are optional (default empty), with at most 100 entries. Each requires a
  unique ID, level (`INFO`, `WARN`, `ERROR`, `SUCCESS`), message, and timezone-aware
  `createdAt` timestamp. IDs allow up to 200 characters; questions and messages
  allow up to 2,000. Blank strings and unknown fields are rejected with HTTP 422.
- Limits bound validated fields, not the raw HTTP body size. A transport-level
  body limit will be needed before exposing the service beyond localhost.
- Responses contain `analysisMode`, tenant/run context, execution status,
  summary, evidence, root-cause assessment, limitations, and next steps.
- Warning/error evidence is ordered by timestamp, then ID. A successful run is
  still reported as successful when its snapshot contains warnings or errors.
- A failure or cancellation has an `undetermined` root cause. Other statuses
  use `not_applicable`. Rules do not infer infrastructure causes from keywords.
- The question is validated but not semantically interpreted. Log text is
  evidence only; embedded commands are not executed or used as instructions.
- Input errors omit submitted field values. Valid responses echo cited messages;
  callers must redact secrets before submission and render text safely.
- Snapshot completeness, freshness, authenticity, and tenant ownership are the
  caller's responsibility. Request isolation is not an authorization mechanism.

## Verification

```sh
.venv/bin/python -m pytest
.venv/bin/python -m build
```

Tests use FastAPI's HTTP test client and exercise every status, malformed inputs,
timestamp validation, evidence limits, prompt-like text, deterministic ordering,
and concurrent tenant request isolation. No database or provider is required.

References: [FastAPI testing](https://fastapi.tiangolo.com/tutorial/testing/)
and [Pydantic model validation](https://docs.pydantic.dev/latest/concepts/models/).

## Next phases

1. Secure NestJS integration with explicit snapshot mapping, timeouts, and fallback.
2. Docker image and local integration verification.

Python LangGraph, real model calls, evaluations, observability, risk/cost controls,
and approved cloud deployment follow in their roadmap phases. MCP and multiple
agents are optional design decisions, not Phase 1 dependencies.
