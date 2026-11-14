# API runtime configuration

The API loads an optional `.env` from its working directory before importing
application modules. Injected environment variables take precedence. Only a
missing file is ignored; other file-loading errors abort startup. Nest validates
the resulting configuration before constructing services and does not load the
file a second time.

Required in both modes: `JWT_SECRET`, `FRONTEND_URL` (HTTP/HTTPS), and
`GEMINI_API_KEY` (the currently wired provider). `NODE_ENV` defaults to
`development`; `PORT` defaults to 3000 and must be an integer from 1 to 65535. `HOST` defaults
to `0.0.0.0`; set `HOST=127.0.0.1` for a host-only local listener.

- Development requires a PostgreSQL `DATABASE_URL`.
- Production requires `DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.
  `DB_PORT` defaults to 5432 and must be a valid integer port. Production does
  not require `DATABASE_URL`; it uses the existing Prisma DB-field configuration.
- Messaging defaults to enabled and then requires `RABBITMQ_URL` (AMQP/AMQPS)
  and `RABBITMQ_QUEUE`. Set `ENABLE_MESSAGING=false` to disable it.
- Redis and Python diagnostics remain optional; worker callback authentication
  is described in [workflow status security](workflow-status-security.md).

Production database TLS now verifies certificates and hostnames. Configure
`DB_CA_CERT` with a trusted PEM CA bundle when system roots are insufficient.
`DB_SSL_MODE=disable` is limited to loopback development; connection-string SSL
query overrides are rejected. Liveness remains `/api/v1/health`; schema, database,
subscriber, and enabled-broker readiness is `/api/v1/health/ready`. No migrations
run as part of API startup. See [H4–H9](architecture-hardening.md) for the runtime
contract and rollout limits.

## Repeatable checks

From the repository root:

```sh
yarn --cwd api test src/config/environment.spec.ts
yarn --cwd api build
yarn --cwd api lint
yarn --cwd api test:startup:image
```

The last command needs Docker and registry access. It builds the actual API
Dockerfile (Node 22 Alpine) and starts it in production mode with injected DB
fields, no `.env` or `DATABASE_URL`, and a separate synthetic PostgreSQL server
using a temporary TLS certificate explicitly trusted by the API through DB_CA_CERT. It asserts HTTP health and the
absence of `.env`/`DATABASE_URL` inside the image. Messaging, Redis, and Python
are disabled/unconfigured; no LLM calls or application database access occur.
No host ports are published. The runner stops the containers and network in a
`finally` block and retains the named synthetic database volume. Local host
checks use Node 24; worker startup continues using its optional `dotenv/config`
loader and is outside this API change.

The same compiled production startup can be checked against an isolated host
PostgreSQL fixture with `api/scripts/startup-host.mjs`: supply the guarded
`ANALYTICS_TEST_DATABASE_URL` and `HARDENING_TLS_CERT` certificate path. This
exercises injected production configuration and readiness without a dotenv file.
The latest Docker rebuild was blocked by a local Docker storage failure; host
startup and real certificate/hostname rejection were verified independently.
