# API runtime configuration

The API loads an optional `.env` from its working directory before importing
application modules. Injected environment variables take precedence. Only a
missing file is ignored; other file-loading errors abort startup. Nest validates
the resulting configuration before constructing services and does not load the
file a second time.

Required in both modes: `JWT_SECRET`, `FRONTEND_URL` (HTTP/HTTPS), and
`GEMINI_API_KEY` (the currently wired provider). `NODE_ENV` defaults to
`development`; `PORT` defaults to 3000 and must be an integer from 1 to 65535.

- Development requires a PostgreSQL `DATABASE_URL`.
- Production requires `DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.
  `DB_PORT` defaults to 5432 and must be a valid integer port. Production does
  not require `DATABASE_URL`; it uses the existing Prisma DB-field configuration.
- Messaging defaults to enabled and then requires `RABBITMQ_URL` (AMQP/AMQPS)
  and `RABBITMQ_QUEUE`. Set `ENABLE_MESSAGING=false` to disable it.
- Redis and Python diagnostics remain optional; worker callback authentication
  is described in [workflow status security](workflow-status-security.md).

Configuration validation does not establish database reachability, production
readiness, or correct TLS identity verification. Production Prisma still uses
`rejectUnauthorized: false`; H9 tracks that separate change. No migrations run
as part of API startup.

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
using a temporary self-signed TLS certificate. It asserts HTTP health and the
absence of `.env`/`DATABASE_URL` inside the image. Messaging, Redis, and Python
are disabled/unconfigured; no LLM calls or application database access occur.
No host ports are published. The runner stops the containers and network in a
`finally` block and retains the named synthetic database volume. Local host
checks use Node 24; worker startup continues using its optional `dotenv/config`
loader and is outside this API change.
