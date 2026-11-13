# EWAP Python Diagnostics Service

Task 1, Phases 1–3: a standalone FastAPI application with Pydantic v2 contracts,
service authentication, NestJS integration, and verified local Docker execution. **Python diagnostics are still
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

Task 1, Phase 3 adds the Docker image and isolated local verification described below.

Python LangGraph, real model calls, evaluations, observability, risk/cost controls,
and approved cloud deployment follow in their roadmap phases. MCP and multiple
agents are optional design decisions, not Phase 1 dependencies.

## Docker and live local verification

From the repository root, create an ignored local environment file once. Do not
overwrite an existing secret when restarting the service:

```sh
umask 077
python3 -c 'import secrets; print("AI_SERVICE_API_KEY=" + secrets.token_hex(32))' > ai-service/.env.local
docker compose --env-file ai-service/.env.local -f compose.ai-local.yml up --build --wait
```

The image uses Python 3.12, installs the pinned runtime dependencies in
`requirements.lock`, and runs as UID/GID 10001. Compose publishes the service only
on `127.0.0.1:18001`, uses a read-only root filesystem and temporary `/tmp`, drops
Linux capabilities, and limits memory/processes. Secrets are runtime environment
variables, excluded from the build context. Do not publish this development
service to the internet. Anyone with Docker-engine access can inspect container
environment variables; production secret delivery/rotation belongs to deployment.

The image health check verifies process health, not authentication or model
availability. `requirements.lock` pins runtime package versions without hashes;
the Python base image follows the `3.12-slim` tag rather than an immutable digest.
Upgrade pins deliberately and rerun tests. Build isolation may download its
setuptools dependency; no package downloads occur when the container starts.

Run the live test with Node 24 and the API's dependencies installed:

```sh
set -a
. ai-service/.env.local
set +a
export AI_DIAGNOSTICS_URL="http://127.0.0.1:${EWAP_AI_PORT:-18001}"
cd api
yarn test:ai:live
```

Only source the local environment file you created and trust. Set `EWAP_AI_PORT`
in that file to use another host port if 18001 is occupied.

The live test starts a temporary NestJS HTTP server on a loopback ephemeral port.
It uses the real controller, JWT guard, validation, workflow-run service,
Python client, and TypeScript LangGraph fallback. The Python HTTP transport is
real. PostgreSQL reads are replaced by explicit in-memory fixtures, Redis is
disabled, and the model provider is a stub. The test makes no database writes or
LLM calls. This verifies the cross-process boundary, not a deployed full-stack
application or a real database's authorization behavior.

It checks real Python diagnostics through NestJS, invalid JWT rejection, a
cross-tenant lookup denial, missing/wrong Python credentials, and TypeScript
fallback after Python rejects a wrong key. Unit tests cover unavailable/slow
services and response validation in more depth. This separate test command is
deliberately not included in the default unit suite.

For the normal host API (rather than the fixture test), add the same key plus
`AI_DIAGNOSTICS_URL=http://127.0.0.1:18001` to its environment. Existing database,
JWT, and provider configuration remain necessary. The complete Compose stack
with the API/database/worker/frontend is roadmap Task 5; `api/docker-compose.yml`
has not been altered.

After verification, from the repository root:

```sh
docker compose --env-file ai-service/.env.local -f compose.ai-local.yml down
```

This isolated project declares no database volumes. The command stops its AI
container/network; it does not delete EWAP database data or other Compose stacks.
