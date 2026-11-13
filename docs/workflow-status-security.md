# Workflow status callback and WebSocket boundaries

H2 authenticates status notifications independently from browser requests and
routes updates only to the run's organization. PostgreSQL remains authoritative.
The callback does not execute workflows or change run status.

## Worker-to-API protocol

`POST /api/v1/workflow-runs/status` requires `X-EWAP-Worker-Key` and accepts:

```json
{ "runId": "<run-uuid>", "status": "RUNNING" }
```

Status must be PENDING, RUNNING, SUCCESS, FAILED, or CANCELLED. Caller-supplied
organization fields are discarded by validation. The API loads the run and its
workflow/project organization directly from PostgreSQL, not from cache or the
request body. The submitted status must equal the persisted status.

When Redis is ready, the API waits for deletion of the individual run, organization
run-list, and workflow run-list keys. A reported deletion failure prevents emission.
Disabled/unavailable optional caching is skipped, matching existing database fallback
behavior. The API re-reads the run after invalidation and rejects a conflicting
state/organization change before emitting to the server-assigned tenant room.

| Result | HTTP status |
| --- | --- |
| Accepted notification | 200 |
| Missing/incorrect worker key, including a user JWT without that key | 401 |
| Invalid UUID or status | 400 |
| Run not found | 404 |
| Status no longer matches the database | 409 |
| Worker authentication not configured, or active cache invalidation failed | 503 |

Keys are compared via constant-time SHA-256 digest comparison. Raw credentials,
callback bodies, and downstream error details are not logged by the new transport.
Identical notifications may repeat: this is not an exactly-once event endpoint.

## Configuration and rollout

Set the same independently generated `WORKER_STATUS_API_KEY` in API and worker
server environments. It must be 32–512 printable ASCII characters without
whitespace. It is distinct from JWT_SECRET and AI_SERVICE_API_KEY. Never put it
in a browser bundle or a NEXT_PUBLIC environment variable.

Worker settings:

```dotenv
WORKER_API_BASE_URL=http://127.0.0.1:3000
WORKER_STATUS_API_KEY=<shared-server-only-secret>
WORKER_STATUS_TIMEOUT_MS=3000
```

The worker validates configuration before processing messages. URLs must be HTTPS
origins; HTTP is accepted only on loopback. URL credentials, paths, query strings,
and fragments are rejected. The old NEXT_PUBLIC_API_BASE_URL origin setting remains
a fallback for migration, but new configuration should use WORKER_API_BASE_URL.
Timeout must be 100–30,000 ms. Redirects are not followed with the credential.

Deploy API, worker, and the authenticated frontend hook together with matching
configuration. Older unauthenticated callbacks/sockets will be rejected. API
instances with no worker key keep normal REST routes available but reject callbacks
with 503; a worker with missing/invalid key fails at startup.

The worker reports callback HTTP/transport failure without throwing it into
execution logic. An obsolete 409 is ignored. A completed workflow is not changed
to FAILED just because its UI notification could not be delivered. There are no
automatic callback retries or durable event storage in H2; failed notifications
may be lost. H4 will add an outbox and independent event-delivery recovery.

## Socket protocol

Socket.IO clients supply a normal access JWT in `auth.token`. Credentials are not
placed in query strings. The server checks signature, identity claims, expiry,
and current user/organization membership in PostgreSQL before accepting the socket.
Tokens without an expiry are rejected. Unauthorized handshakes return only
`Unauthorized`, without disclosing whether a tenant or user exists.

The server joins `org:<organizationId>:workflow-updates` using the verified tenant;
there is no client-controlled join/subscribe handler. It emits
`workflow.updates.ready` once that join is complete, then sends
`workflow.status.changed` as `{ runId, status }` only to that room.
Established sockets are disconnected no later than JWT expiry; timers are cleared
when clients disconnect. The frontend retrieves its current token again on each
connection/reconnect, and disconnects the socket when the hook unmounts.

This preserves existing status event names and payloads. Socket.IO does not
automatically replay missed updates: REST remains the authoritative read path.

## Guarantees and limits

- Callback credentials authenticate the shared worker service, not a particular
  execution attempt. The trusted worker can notify about runs across tenants;
  the API chooses the destination solely from persisted ownership.
- Database rechecks reject conflicting stale statuses, but there is no atomic
  database-to-WebSocket transaction or monotonic attempt/event revision. State
  can still change after the final read. Notifications are refresh hints, not a
  substitute for reading the run. Attempt identity/recovery belongs to H4.
- The callback uses exact-key deletion, but other cache paths still use broad
  invalidation. Concurrent cache fills and recovery freshness remain H8 work.
- Socket membership is checked at connection time; general token revocation and
  immediate connected-session permission revocation remain separate work.
- Rooms and broadcasts are local to one API process. Use a single API replica
  until cross-replica Socket.IO fan-out is implemented and verified. This change
  does not add an adapter or claim multi-replica delivery.
- Rate limits, durable event retries, broker publisher confirms, full-stack
  deployment, and production secret rotation are not completed by this task.

## Tests

Unit tests cover the service key, persisted-state checks, cache-before-emission
ordering, racing state changes, failure behavior, room targeting, JWT expiry, and
worker transport timeouts/configuration. Worker execution tests ensure failed
notifications do not overwrite SUCCESS.

From `api/`, with the isolated database described in [analytics.md](analytics.md):

```sh
yarn test:workflow-status:db
```

The live suite uses real NestJS modules, HTTP, Socket.IO clients/server, JWTs,
and PostgreSQL. Redis operations are mocked so invalidation failure can be tested
without changing any shared Redis data. It verifies missing/invalid/expired
identities, wrong membership, worker credentials versus user JWTs, cross-tenant
delivery, attempted room spoofing, stale states, malformed callbacks, active-cache
failure, and established-session expiry. All database rows are uniquely named
synthetic fixtures. No real workflow or model call is executed and no application
database is touched.
