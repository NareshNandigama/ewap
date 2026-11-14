# Architecture hardening H4–H9

Implemented locally on `feature/workflow-status-authorization`. These changes
require coordinated API/worker/frontend rollout and the two additive migrations.
No application database migrations, deployment, or real model calls were made
as part of local verification.

## H4: dispatch, execution, and status delivery

`POST /workflows/:workflowId/runs` authorizes the tenant first, then creates the
PENDING run and EXECUTE outbox record in one PostgreSQL transaction. Optional
`Idempotency-Key` accepts 1–128 ASCII letters, digits, dots, underscores, colons,
or hyphens; its scope is the authenticated organization and workflow. Concurrent
requests with the same key return the same run. The frontend proxy preserves
this header. Requests without a key intentionally create a new run each time.
Messaging disabled creates a persisted PENDING run with `dispatchEnabled=false`
and no outbox entry. Enabling messaging later does not automatically dispatch
those intentionally disabled runs. Existing runs migrate with dispatch disabled;
no retroactive execution is performed.

The API relay polls once per second, claims up to 25 records with fenced 60-second
leases, and marks delivered only after confirmed broker publication. Failed
publication is deferred five seconds. A crash after publication can duplicate a
message; delivery is at least once. Run detail responses expose initial dispatch
state (`DISABLED`, `QUEUED`, `DISPATCHED`) and outbox timing. DISPATCHED means
broker handoff, not successful execution. PostgreSQL owns this state; Redis is
not required for command acceptance.

The worker atomically claims a run, writes its start log, and appends a status
outbox entry. Claims have a random fencing token and a 30-second lease renewed
every five seconds. A terminal update requires the current token and an unexpired
lease; outcome and status entry commit together. Heartbeat failure cancels local
execution. The API creates a stable recovery dispatch for an expired RUNNING
attempt, even if a duplicate delivery was already ACKed. The worker status relay
retries authenticated callbacks independently; notification failure cannot turn
SUCCESS into FAILED. Obsolete callback responses (409) acknowledge a superseded
hint. Failed attempts remain recoverable if the worker crashes before retry
handoff. Only a persisted execution failure advances the retry counter.

The current executor remains a side-effect-free two-second placeholder. This is
not exactly-once execution for future external effects: real steps must honor
cancellation and use stable per-step idempotency keys. Delivered outbox history
is retained; no automatic database deletion/retention job was introduced.

## H5: broker handoff and backpressure

Retry/DLQ publication uses confirm channels, persistent mandatory messages,
message IDs, a ten-second confirmation deadline, a maximum of 16 pending
publications, and reconnect/recreated topology with a two-second delay. The
connection manager handles socket drain. Mandatory returns reject a handoff even
if the broker confirms receiving the unroutable message. The original delivery
is ACKed only after a successful handoff; a failed handoff NACKs/requeues it.
Consumer prefetch is four. Ambiguous disconnects can produce duplicates, handled
by run claims; confirmations do not establish exactly-once delivery.

The retry queue retains the existing five-second TTL/dead-letter topology.
Production must configure RabbitMQ durable/quorum queues and dead-letter safety
according to its availability requirements; ordinary queue TTL/DLX transit is
not claimed immune to every broker/node failure. Retry/DLQ guarantees here cover
the explicit publisher handoff before ACK.

## H6–H7: authorized chat and streaming lifecycle

Every conversation read/write checks its owner, current user organization, and
run organization. Requests supplying a conversation also require the same run.
A new conversation validates the run before any message is written. History is
limited to the newest 40 messages; only COMPLETED messages enter the model prompt.
User questions are limited to 8,000 characters. Run details expose the newest 200
logs in chronological order and `logsTruncated` when earlier logs were omitted.

Streaming is SSE: `conversation` identifies the conversation/message, `delta`
contains provisional text, and `terminal` reports COMPLETED/FAILED/CANCELLED.
The assistant row starts STREAMING and becomes terminal before completion is
announced. Partial failure/cancellation text is retained with its state. A later
history read marks STREAMING rows older than 60 seconds FAILED, recovering from
API process loss. A persistence failure ends the stream without a completion
frame; the frontend rejects EOF as success. The frontend labels incomplete
history and cancellation; its proxy forwards request cancellation upstream.

Client disconnect and a 35-second request deadline propagate AbortSignal to the
provider. Both provider adapters limit each call to 30 seconds, 120,000 input
characters, 4,096 requested output tokens, 32,000 emitted characters, zero SDK
retries, and eight active provider operations per API process. The response
writer waits for drain rather than buffering unbounded output. Failed,
incomplete, and truncated provider streams cannot become COMPLETED merely
because iteration ended. OpenAI handling follows the semantic terminal events in
[official OpenAI documentation](https://developers.openai.com/api/docs/guides/streaming-responses).

Cancellation aborts local HTTP/provider work; it does not prove that remote
computation or billing immediately stopped. The limits are per process, not a
tenant spending cap or distributed rate limiter (roadmap Task 3).

## H8: freshness and cache behavior

Workflow list/detail reads use PostgreSQL directly, including authorization.
This intentionally trades cache speed for correctness while writes span the API
and worker; late cache fills, missed notifications, or Redis recovery cannot
restore an old workflow snapshot. Existing invalidation still clears old keys.
Redis pattern invalidation uses SCAN and bounded DEL batches instead of KEYS.

Integration diagnostics load their authorized latest-50-event snapshot before
cache lookup and pass that same snapshot into the graph. Cache keys contain a
hash of exact-case question text, evidence content, prompt version, provider
model, and provider-limit version, scoped by organization/run. Late fills for old
evidence cannot replace current evidence. Redis failure bypasses caching. This
bounds analyzed evidence; it does not claim full historical-event coverage or
prove the model's answer is correct.

## H9: schema, TLS, readiness, and replicas

`api/prisma/schema.prisma` is canonical. The worker schema and database TLS helper
are generated by `node scripts/schema-sync.mjs`; `--check` rejects drift and is
part of the worker build. Use `yarn --cwd worker prisma:generate` after canonical
changes. Historical migrations are unchanged; only API migrations own database
changes. API and worker still generate separate local clients.

Production database connections verify certificate chains and hostnames. Set
`DB_CA_CERT` to a PEM CA bundle for private/provider roots, or use the system
trust store. `DB_SSL_MODE=disable` is allowed only for loopback development.
URL-based connections reject `ssl*` query parameters that could override the
explicit TLS policy. The API production configuration continues using DB_*
fields; the worker uses DATABASE_URL with the same TLS policy. Existing insecure
production settings must be corrected before rollout. No bypass was added for
self-signed production certificates.

`GET /api/v1/health` is liveness. `/health/ready` additionally checks the required
schema columns, the PostgreSQL status subscriber, and the broker when messaging
is enabled; failure returns 503. Database connection/query and broker-readiness
timeouts are bounded. Redis remains optional for these flows.

Each API replica maintains a reconnecting PostgreSQL LISTEN subscriber. Status
callbacks publish tenant-scoped hints through `pg_notify`, and each replica
emits only to its own authenticated tenant rooms. Subscriber reconnection emits
a resync hint; the frontend refreshes authorized HTTP state on subscription,
reconnect, and status hints. Frontend sockets use WebSocket transport so this
scheme does not require cross-instance Socket.IO polling-session routing. Load
balancers must support WebSocket upgrades. Notifications are ephemeral hints,
not a replayable event log; HTTP/database reads remain authoritative.

## Reproducible verification

```sh
node scripts/schema-sync.mjs --check
yarn --cwd api test
yarn --cwd worker test
yarn --cwd api build
yarn --cwd worker build
yarn --cwd api lint
yarn --cwd worker lint
node --test web/scripts/ai-stream.test.mjs
# Run from web/: yarn build --webpack

# Isolated PostgreSQL fixture (uses ignored .env.analytics-local):
docker compose --env-file .env.analytics-local -f compose.analytics-local.yml up -d --wait
node api/scripts/analytics-local.mjs migrate
node api/scripts/analytics-local.mjs hardening
node api/scripts/analytics-local.mjs status

# Dedicated broker with synthetic credentials, no application queues:
docker compose -f compose.broker-hardening.yml up -d --wait
yarn --cwd worker test:broker:local

# Stop fixtures; retain their named volumes:
docker compose -f compose.broker-hardening.yml down
docker compose --env-file .env.analytics-local -f compose.analytics-local.yml down
```

The guarded database runner also accepts an explicitly supplied loopback
`ANALYTICS_TEST_DATABASE_URL` for analytics_owner/ewap_analytics_test. A host
PostgreSQL installation with pgvector can be used if Docker is unavailable.
`api/scripts/database-tls.mjs` and `api/scripts/startup-host.mjs` accept that fixture URL plus
`HARDENING_TLS_CERT` pointing to its generated certificate; it verifies trusted
CA success, untrusted CA failure, and hostname mismatch failure; the startup script verifies compiled production readiness
from a fresh directory using injected DB_* settings and verified TLS.

Actual counts, runtime versions, and the Docker storage limitation from this
verification session are recorded in the engineering roadmap. No real model
calls, production data changes, cloud provisioning, or paid resources are needed
for these checks.
