# EWAP Python Diagnostics Service

Task 1, Phases 1–2: a standalone FastAPI application with Pydantic v2 contracts,
service authentication, and NestJS integration. **Python diagnostics are still
deterministic; Python makes no LLM calls.**

## Boundary

NestJS owns authentication, organization authorization, database reads,
conversations, and caching. This service owns diagnostic computation over an
explicit evidence snapshot. It has no database, Redis, or provider credentials.
The existing `POST /api/v1/ai/agent/diagnose` endpoint can now call Python when
configured. Other AI/chat/streaming and integration-event routes are unchanged.

`organizationId` is caller-supplied context, not authentication. Python cannot
verify ownership of a run or log without NestJS's authorized lookup. The service
stores no request state. Diagnostic requests require `X-EWAP-Service-Key`, checked
with constant-time comparison. Missing key configuration yields HTTP 503 on
diagnostics; a missing/wrong credential yields HTTP 401. Health stays public.
The shared credential authenticates NestJS, not individual tenants. A compromised
caller can submit arbitrary snapshots; Python cannot independently authorize them.
Keep local development on loopback. Cloud deployment and operational hardening
are later phases, including TLS, private networking, key rotation, and rate limits.

Using a snapshot preserves one database owner but introduces a contract that
NestJS will need to map explicitly. Full Prisma objects (including arbitrary
metadata) are intentionally not accepted. No migrations are needed.

## Setup and run

Python 3.12 or newer is required. From this directory:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
# Generate a local secret; set the same value in the NestJS environment.
export AI_SERVICE_API_KEY="$(.venv/bin/python -c 'import secrets; print(secrets.token_hex(32))')"
.venv/bin/python -m uvicorn ewap_ai.main:app --host 127.0.0.1 --port 8001
```

OpenAPI is available at `http://127.0.0.1:8001/docs`.

```sh
curl --fail http://127.0.0.1:8001/health
curl --fail-with-body http://127.0.0.1:8001/v1/diagnostics/workflow-run \
  -H 'Content-Type: application/json' \
  -H "X-EWAP-Service-Key: $AI_SERVICE_API_KEY" \
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
- Diagnostic request bodies are limited to 1 MiB before JSON parsing, including
  chunked bodies; larger bodies yield HTTP 413.
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

## NestJS integration

Configure these variables in the API's environment (leave `AI_DIAGNOSTICS_URL`
unset to retain TypeScript-only diagnostics):

```dotenv
AI_DIAGNOSTICS_URL=http://127.0.0.1:8001
AI_SERVICE_API_KEY=<same-secret-as-python>
AI_DIAGNOSTICS_TIMEOUT_MS=3000
```

Both apps require a 32–512 character ASCII secret without whitespace. The client
accepts an HTTPS origin, or HTTP only on loopback; paths, credentials, query
strings, and fragments in the configured origin are rejected. Python does not
automatically load `.env`; export the variable before starting Uvicorn. NestJS
uses its existing environment loading. Never reuse an end-user JWT as this key.

The JWT-protected endpoint gets organization context from the authenticated user:

```sh
curl --fail-with-body http://localhost:3000/api/v1/ai/agent/diagnose \
  -H "Authorization: Bearer $EWAP_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"question":"Why did this fail?","workflowRunId":"<run-uuid>"}'
```

NestJS first performs the existing tenant-scoped lookup. An inaccessible run is
rejected before calling Python or the LLM. It projects the latest 100 logs and
caps messages at 2,000 characters, excludes arbitrary metadata, and handles both
database Date objects and cached timestamp strings. Snapshots are not a secret
redactor: log producers remain responsible for removing sensitive information.

The HTTP client has a configurable 100–30,000 ms deadline covering connection and
response-body reading, a 1 MiB response limit, no redirects/retries, strict response
validation, and matching tenant/run/status/evidence checks. Errors produce a
sanitized fallback reason in API logs, without logging keys or evidence.

Responses preserve `answer` and add `source: "python-deterministic"` plus structured
`diagnostics`, or `source: "typescript"` when Python is disabled/unavailable.
Timeouts, authentication errors, invalid responses, and HTTP failures fall back
to the existing TypeScript LangGraph/LLM path. This fallback can incur existing
provider costs; its latency and provider availability are separate from the Python
deadline. It re-reads the run within the same organization. Database/authorization
errors during the initial lookup do not trigger fallback. Fallback provider errors
propagate rather than pretending analysis succeeded.

For existing API tests, from `api/`:

```sh
yarn test src/ai/python-diagnostics.client.spec.ts src/ai/workflow-diagnostics.service.spec.ts src/ai/ai.controller.spec.ts
yarn lint
yarn build  # use Node 24 in this repository's current toolchain
```

References: [FastAPI testing](https://fastapi.tiangolo.com/tutorial/testing/)
and [Pydantic model validation](https://docs.pydantic.dev/latest/concepts/models/).

## Next phases

1. Docker image and live local integration verification (Task 1, Phase 3).

Python LangGraph, real model calls, evaluations, observability, risk/cost controls,
and approved cloud deployment follow in their roadmap phases. MCP and multiple
agents are optional design decisions, not Phase 1 dependencies.
