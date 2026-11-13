# Tenant registration and membership authorization

Architecture hardening item H1 replaces public membership creation with atomic
organization registration and authenticated administration. No schema migration
or existing-user rewrite is required.

## Registration

`POST /api/v1/auth/register` remains public and accepts:

```json
{
  "organizationName": "Example Engineering",
  "name": "Organization Owner",
  "email": "owner@example.com",
  "password": "a-unique-long-password"
}
```

It always creates a **new** organization with one ADMIN using an atomic Prisma
nested write. It cannot join an existing organization by ID or name. Organization
names are labels, not unique identifiers. Submitted organizationId/role fields are
discarded by the existing ValidationPipe whitelist and are never used by the service.

Returns HTTP 201 with `{ accessToken, organization: { id, name }, user }`. The
token's organization comes from the created database record. A duplicate email
returns 409; the failed nested write does not leave an orphan organization.
Concurrent duplicate requests result in one successful account/organization and
one conflict, rather than two first administrators. If a successful response is
lost, use normal login; registration is not an idempotent replay endpoint.

Names are trimmed and bounded to 2–100 characters; email is trimmed and bounded
to 254 characters. Passwords are not trimmed. New passwords require at least
eight characters and at most 72 UTF-8 bytes to avoid bcrypt truncation. Passwords
are hashed with bcrypt cost 12 and never selected into API user responses. Email
case/uniqueness retains the existing database and login behavior; this change does
not normalize historical accounts.

The old `POST /organizations` route is removed. The insecure two-request bootstrap
must not be used by external API clients. No signup UI existed in the frontend;
existing login and organization-project flows remain available. Existing empty
organizations are not anonymously claimable; recovering their ownership requires
a separately verified administrative process, not public first-user promotion.

## Existing organization access

| Endpoint | Required access |
| --- | --- |
| `GET /organizations` | Valid JWT; returns only the caller's organization as an array |
| `GET /organizations/:id` | Valid JWT for that organization; other IDs return 404 |
| `POST /organizations/:id/users` | Current ADMIN of that organization; creates MEMBER only |
| `GET /organizations/:id/users` | Current ADMIN of that organization |
| `GET /users/:id` | MEMBER may read self; ADMIN may read users in the same organization |

Unauthenticated reads or membership writes return 401. Members cannot create
accounts or enumerate the directory (403). Cross-organization membership/list
operations return 403; inaccessible profile/organization IDs return 404. User
responses omit both password and passwordHash.

JWT validation now requires non-empty subject and organization claims and an
ADMIN/MEMBER role. Identity must be valid before it reaches tenant-scoped services;
an undefined organization cannot become an unfiltered Prisma lookup. JWT expiry
and signature verification remain provided by the existing JwtService.

Privileged user operations recheck current ADMIN membership in PostgreSQL. A stale
ADMIN token after demotion cannot manage members. Member creation rechecks this
inside a serializable transaction, with a pre-hash check to reject unauthorized
requests before expensive password hashing. No count-then-promote path remains.

Public demo access only issues tokens for a configured MEMBER account; pointing
the demo setting at an ADMIN fails closed. General JWT revocation, session storage,
email verification, invitations, password reset, administrator promotion/transfer,
and changing other endpoints' stale-token semantics are not implemented here.
Administration currently provisions a member's initial password through the
existing API contract; an invitation/activation flow can replace that separately.
Public registration/login rate protection remains pending in Task 3.

## Verification

Unit tests cover role/scope checks, current ADMIN verification, profile filtering,
atomic registration shape, JWT claim validation, password byte bounds, and demo
role restrictions. PostgreSQL tests use actual Auth/User/Organization modules,
HTTP, JWT guards, validation, bcrypt, and Prisma, including concurrent registration.
They do not mock authorization or account persistence.

Use the isolated test database setup in [analytics.md](analytics.md), then from `api/`:

```sh
yarn test:membership:db
```

The command uses the guarded loopback `ewap_analytics_test` database and never loads
the application's database URL. Fixtures use unique tenant/account identifiers;
the tests preserve existing rows and make no production database changes. One test
demotes only its freshly created synthetic administrator to exercise a stale JWT.
Database data is not reset or deleted. The isolated Compose volume is preserved
when the container is stopped.
