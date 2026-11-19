# Full-stack local Compose

This is Task 5's local phase: Next.js, NestJS, PostgreSQL/pgvector, RabbitMQ,
Redis, the workflow worker, deterministic Python diagnostics, and an HTTP/HTTPS
Nginx gateway. It uses the separate `ewap-local` Compose project and volumes;
it does not connect to the deployed application or the analytics test database.
Azure provisioning, public DNS/certificates, CI/CD deployment, managed backups,
and production operations remain later work.

## Start and sign in

Install Docker Desktop with Compose v2 and Node 24. Initial image builds download
locked dependencies and need several GB of free disk plus Docker memory. Builds
run sequentially to bound peak disk/memory use; they discard package-download
caches. Later builds reuse Docker layers. No host Yarn/Python installation or
host database/broker is required.

From the repository root:

```sh
node scripts/local-stack.mjs init
node scripts/local-stack.mjs check
node scripts/local-stack.mjs up
node scripts/local-stack.mjs account
node scripts/local-stack.mjs smoke
```

Open **http://localhost:18080/login**. Sign in with `EWAP_LOCAL_EMAIL` and
`EWAP_LOCAL_PASSWORD` from the generated `.env.stack-local`. The account command
uses the normal registration/login API; it does not bypass tenant authorization.
It is safe to repeat with unchanged credentials. Guest/demo login is not seeded.

`init` writes unique local-only database, broker, JWT, worker/service-key, and login
secrets with mode 0600. Existing infrastructure secrets are retained on repeat.
The ignored file is never copied into images or committed. Do not delete/change
its database/broker values while retaining initialized volumes: that does not
rotate stored database/broker credentials. Keep a secure copy if you need the
persistent local data. Docker administrators can inspect container environments.

Optional ports `EWAP_WEB_PORT` (18080) and `EWAP_TLS_PORT` (18443) can be changed
in this file before `up`. The public WebSocket URL is built into Next.js, so port
changes require rebuilding the web image. Browser API calls use `/api/v1` on the
same gateway origin. The gateway routes WebSockets to the authenticated API.

## Components and startup

| Component | Local behavior |
| --- | --- |
| TLS init job | Generates a project-local CA and PostgreSQL/gateway certificates once |
| PostgreSQL | pgvector image, persistent data, TLS-only network authentication |
| Migration job | API-owned canonical migrations; must succeed before API starts |
| RabbitMQ | Persistent messaging and retry/DLQ topology; no published management port |
| Redis | Persistent append-only local store; shared quotas stay enabled |
| API | Node 24, non-root runtime, verified DB TLS and CA trust for internal HTTPS |
| Python | Existing non-root Python 3.12 image, deterministic mode, authenticated service boundary |
| Frontend | Next.js standalone Node 24 runtime, non-root, read-only image with temporary cache |
| Gateway | Only published service: loopback HTTP 18080 and HTTPS 18443 |
| Worker | Node 24, canonical generated schema, verified DB TLS, authenticated HTTPS status callbacks |

PostgreSQL, broker, Redis, API, Python, frontend and gateway use health checks.
The worker is considered running by Compose; the smoke test verifies actual
consumption/execution, not just process existence. API readiness includes its
existing DB, broker and PostgreSQL status-fan-out checks. Redis has its own health
check; quota requests fail closed if it later becomes unavailable.

The gateway's internal HTTPS origin is `https://gateway:8443`. API→Python and
worker→API use that origin and trust only the generated CA through Node's standard
extra-CA mechanism. No URL-validation or production TLS policy is weakened.
PostgreSQL clients verify the generated CA and hostname; migrations use Prisma's
strict certificate settings. Plaintext TCP database connections are rejected.
Gateway upstream hops to application containers remain HTTP on the private local
Compose network. Browser HTTP is deliberately loopback-only for convenient local
use; this is not an internet-facing deployment configuration.

The optional browser HTTPS endpoint is **https://localhost:18443**. Its generated
CA is not automatically trusted by your browser/OS; a browser warning is expected
until you deliberately trust it. For an HTTPS browser session with live updates,
set `EWAP_PUBLIC_ORIGIN=https://localhost:18443` in the local env file before
rebuilding/restarting; this aligns the API CORS origin and public socket URL. The
default verified browser flow uses HTTP loopback. Do not disable verification globally. Local
certificates expire after one year. Rotate/reissue expired certificates with the
stack stopped and restart all clients; never delete the TLS volume blindly while
services are using it. No automatic certificate renewal is claimed.

The default stack passes no real model/embedding credentials. Python diagnostics
work deterministically, and grounded diagnostics abstain as documented. Generic
provider chat, model grounding, and vector indexing require a deliberate local
override and valid provider settings; they are not verified by this task and may
incur charges. The dummy Gemini value only satisfies existing startup validation.
Do not point production clients at this local stack.

## Verification

`smoke` runs inside the API builder image, with no host npm dependencies. It
checks frontend HTTP, API readiness, encrypted DB access/plaintext rejection,
registration/login, tenant separation, idempotent run creation, actual
RabbitMQ→worker execution to SUCCESS, authenticated status sockets, deterministic
Python diagnostics over internal HTTPS, keyword runbook retrieval, and grounded
abstention. No paid provider is called. It creates uniquely named local fixture
organizations/projects/runs that remain in this isolated database for inspection;
its temporary runbook is deleted. It prints no JWTs or passwords.

Authentication and AI quotas remain enabled. Repeated smoke/account commands can
exceed those per-minute limits; wait for Retry-After before repeating. The gateway
is one trusted local hop but the API's existing IP policy is unchanged, so browser
clients share that gateway IP's auth quota. This local setup does not configure a
public reverse-proxy trust policy.

```sh
node scripts/local-stack.mjs status
node scripts/local-stack.mjs stop
node scripts/local-stack.mjs up
node scripts/local-stack.mjs smoke
```

`stop` preserves containers, certificates and volumes. `down` removes this
project's containers/network but retains volumes. Neither command deletes data.
A full reset with volume removal is destructive and is intentionally not exposed
by the helper. Do not run arbitrary volume-prune commands to repair a build.
If the disk is full, stop this build and remove only rebuildable caches/generated
artifacts, preserving database volumes and secrets.

## Local logical backup and restore verification

```sh
mkdir -p .local-backups
node scripts/local-stack.mjs backup .local-backups/local.dump
node scripts/local-stack.mjs verify-backup .local-backups/local.dump
```

Backup files are created with mode 0600 and never overwritten. The directory is
ignored by Git. Dumps contain local user/application data and must be protected.
The verify command creates `ewap_restore_check`, restores the dump there with
error checking, queries restored runs/migrations, and removes only that temporary
database. It never restores over `ewap_local`; if the verification database already
exists, creation fails instead of deleting it. Run with this stack's PostgreSQL
running. This verifies logical restore readability, not point-in-time recovery,
off-site retention, encryption at rest, or production recovery objectives. Broker,
Redis and TLS volumes are persistent but are not included in the PostgreSQL dump.

## Source and limits

API and worker images use Node 24; their schemas remain API-owned. The worker's
root Docker context copies only source needed by the build and excludes secrets,
generated clients, host dependencies, Git, and local artifacts. API/frontend
contexts exclude environment files too. The API runtime is now non-root. The
frontend uses Next.js standalone output without changing application routes.

References: [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
and [Prisma PostgreSQL TLS options](https://docs.prisma.io/docs/orm/core-concepts/supported-databases/postgresql).
