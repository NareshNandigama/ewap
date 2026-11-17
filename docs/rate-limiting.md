# Redis rate limiting

Rate limits are enabled by default. Set `REDIS_URL` to a shared Redis instance
reachable by every API replica. Registration, login, demo login, and AI POSTs
return **503** with `Retry-After: 1` until Redis is ready, or when a quota command
fails. Optional diagnostic caching continues to fail open. Commands have a one
second timeout; offline commands are not queued. A command timing out may still
have consumed quota, so enforcement is conservative.

For isolated local development only, `RATE_LIMIT_ENABLED=false` explicitly
bypasses quotas. This disables abuse protection. Existing database/Python test
fixtures opt out because they test separate boundaries.

| Scope | Requests per 60 seconds |
| --- | --- |
| Registration, per IP | 5 |
| Login, per IP | 20 |
| Demo login, per IP | 20 |
| Login, per normalized email across IPs | 10 |
| All AI POST routes combined, per tenant | 60 |
| All AI POST routes combined, per user within tenant | 15 |

AI routes include `/ai/ask`, `/ai/ask/stream`, `/ai/agent/diagnose`, and
`/integrations/events/diagnose`, `/runbooks/search`, and `/runbooks/:sourceKey/index`. Read-only conversation routes do not consume
AI quota. JWT guards run before AI quota checks. Tenant/user identities come
from the verified JWT. Authentication attempts count regardless of success;
AI requests count before validation, authorized run lookup, or provider work.
This limits request starts, not simultaneous active streams or token spend.

Atomic Lua INCR/PEXPIRE establishes each key's fixed window at its first request.
Exceeding any applicable quota produces **429** and an integer `Retry-After`
rounded up from the longest blocked window. All applicable counters are consumed,
including on rejected attempts. Rejections do not extend windows. Redis keys use
SHA-256 identity digests and the `ewap:quota:v1:` namespace; bodies, prompts,
credentials, and raw email/IP values are not stored. Digests are pseudonymous,
not encryption. Redis state loss or eviction resets quotas; use durable Redis
and an appropriate memory policy for deployment.

The API uses Express `request.ip` and does not trust forwarded headers by default.
Behind a reverse proxy, configure a narrowly scoped trusted-proxy policy before
relying on per-client IP quotas. Otherwise clients share the proxy IP quota.
Never blindly trust arbitrary `X-Forwarded-For` input.

Run tests against an isolated Redis database (never production):

```sh
docker run -d --rm --name ewap-rate-limit-check -p 127.0.0.1:16389:6379 redis:7-alpine
cd api
RATE_LIMIT_TEST_REDIS_URL=redis://127.0.0.1:16389 npx vitest run src/rate-limit src/redis/redis.service.spec.ts src/auth/auth.controller.spec.ts src/ai/ai.controller.spec.ts
cd ..
docker stop ewap-rate-limit-check
```

The real Redis test skips unless its URL is explicitly supplied. It uses unique
keys, deletes its own keys, and never flushes a database.
