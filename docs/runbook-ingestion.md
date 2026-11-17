# Tenant-owned runbook ingestion

Task 4 phase 2 adds a NestJS API for plain-text runbooks. NestJS owns database
access; Python remains stateless and does not receive runbooks yet. Authorized
retrieval and opt-in embeddings are documented in [retrieval](runbook-retrieval.md). No documents are fetched from URLs, rendered
as HTML, executed, or sent to a model during ingestion.

All routes require a JWT. Current organization membership is checked against the
database on every operation. Members can read their organization's runbooks;
only current administrators can write/delete. Documents are organization-wide
(`accessScope: ORGANIZATION`), with no public or cross-tenant access. Tenant and
actor IDs come from the authenticated user, never request metadata. Submitted
access/organization/creator fields are not writable.

| Method and route under `/api/v1` | Behavior |
| --- | --- |
| `PUT /runbooks/:sourceKey` | Create or replace a runbook and its chunks atomically; returns metadata with current version |
| `GET /runbooks` | Up to 50 active documents, ordered by ID; metadata only |
| `GET /runbooks?after=<last-id>` | Next page using the last ID returned; empty array ends pagination |
| `GET /runbooks/:sourceKey` | Current metadata and full content |
| `GET /runbooks/:sourceKey/versions/:version` | Immutable revision content/metadata while the document remains active |
| `DELETE /runbooks/:sourceKey?expectedVersion=<current>` | Delete content, chunks, and revisions; returns 204 |

A source key is a stable tenant-local identifier of 1–100 lowercase ASCII letters,
digits, dots, underscores, or hyphens, starting with a letter or digit. Two tenants
can use the same key. Missing/inaccessible keys and revisions return 404 on reads.
Delete of an absent/already-deleted key is a 204 no-op in the caller's tenant.

Example create body:

```json
{
  "title": "Worker timeout investigation",
  "source": "https://internal.example/runbooks/worker-timeout",
  "content": "Check worker availability and inspect the failed step logs.",
  "expectedVersion": 0
}
```

`title` is required (nonblank, at most 200 characters); optional `source` is
opaque provenance text (at most 2,000 characters), not a URL ingestion instruction.
Content must be nonblank and at most 100,000 JavaScript string code units. The
API's existing JSON body-size limit also applies (approximately 100 KiB): a large
or heavily escaped Unicode payload may hit that limit first and return 413.
Content is stored verbatim; title/source are trimmed and blank source becomes
null. Clients must redact secrets before upload and render returned text safely.
Runbook text remains untrusted input for any future retrieval/model integration.

Use `expectedVersion: 0` for creation and the last returned version for replacement.
A different update against a stale version returns 409. Identical canonical
content/title/source/chunker retries return current metadata without another
revision, timestamp change, or chunk write, even if the submitted version is old.
Concurrent create retries deduplicate by tenant/source key. Serializable transactions
retry unique/serialization conflicts up to three attempts; exhaustion returns 409.
Clients can retry after refetching current metadata.

Each changed document gets an immutable revision with title, source, exact content,
SHA-256 content hash, chunking version, submitting user ID, and timestamp. Current
metadata also records creator/updater IDs and timestamps. These are provenance
fields, not a complete audit trail. Revisions are available by version; the
current document metadata supplies the latest number.

Chunks use `unicode-1000-150-v1`: up to 1,000 Unicode code points each, 150 code
points of overlap, stable zero-based indexes, exact text, and SHA-256 chunk hashes.
Splits preserve code points, but can divide paragraphs or grapheme clusters;
chunking quality will be evaluated with retrieval in later phases. Each chunk
stores tenant, document ID, and document version. Composite foreign keys enforce
chunk/revision ownership against the document's tenant. Replacement removes old
chunks (including any embeddings) and writes all new chunks in the same transaction
as the document/revision. A failure rolls everything back. There is no background
indexing queue, partial index state, provider call, or embedding generation here;
the existing optional vector column stays null for new chunks.

Delete removes all current content and revision history, including any embeddings,
inside a transaction. A content-free tombstone retains source key, document ID,
version counter, ownership, actor IDs, and timestamps. Recreating a deleted key
uses expectedVersion 0 and advances its version past the tombstone. A delayed
old update/delete therefore cannot overwrite/remove recreated content. After
deletion, old revision content is no longer available; backup retention is outside
this endpoint. Tombstones are not returned by list/read routes. This is logical
content deletion, not physical removal of every identifier.

The migration preserves existing knowledge documents with null source keys,
labels their chunker `legacy-v0`, backfills hashes and a baseline revision, and
repairs redundant legacy chunk tenant fields before adding composite foreign keys.
Legacy rows are not exposed by the managed source-key API. No original historical
versions are inferred. Canonical schema/migrations live in `api/prisma`; the
worker schema is generated with `node scripts/schema-sync.mjs`.

## Local verification

Only use the isolated local database described in [analytics](analytics.md):

```sh
docker compose --env-file .env.analytics-local -f compose.analytics-local.yml up -d --wait
cd api
npm run analytics:migrate:local
npm run test:runbooks:db
npx vitest run src/runbook
npm run test:membership:db
npm run build
npm run lint
npm run schema:check
cd ..
docker compose --env-file .env.analytics-local -f compose.analytics-local.yml stop
```

Use Node 24. The guarded database commands refuse non-loopback/non-test database
connections. Tests create uniquely named tenant fixtures and remove only those
fixtures. The legacy migration test uses a transaction-local schema and rolls it
back. Tests cover HTTP/JWT roles, tenant separation, current membership, forged
metadata, chunk hashes, immutable revisions, concurrent retries, stale versions,
transaction rollback, deletion/recreation, pagination, composite owner constraints,
and legacy-data migration. No production migration/deployment is performed.
