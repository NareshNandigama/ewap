# Authorized runbook retrieval

Task 4 phase 3 adds PostgreSQL full-text, pgvector cosine, and hybrid passage
retrieval. NestJS retains all database/tenant authorization. Retrieved passages
can be used through the opt-in [grounded diagnostics](grounded-diagnostics.md).

| Method and path under `/api/v1` | Access and behavior |
| --- | --- |
| `POST /runbooks/search` | Current tenant members; keyword, vector, or hybrid passage search |
| `POST /runbooks/:sourceKey/index` | Current tenant administrators; generate/install embeddings for the current version |

Both routes require JWTs and consume the existing shared AI tenant/user quotas
(60/15 request starts per minute). Redis is required unless explicitly disabled
for local development. Search also rechecks current membership inside the SQL
statement. Tenant IDs in bodies are not writable; no client-supplied vectors or
model identifiers are accepted. Existing runbook read/write/delete routes remain
as documented in [ingestion](runbook-ingestion.md).

## Search

```json
{"query": "connection timeout", "mode": "keyword", "limit": 5}
```

The query must be nonblank and at most 1,000 JavaScript string code units. Mode
defaults to `keyword`; limit defaults to 5 and accepts integers 1–10. Results contain
mode, embeddingModel (null for keyword), and `passages`. Empty passages mean no
eligible candidates; they do not establish a diagnosis.

Every passage includes chunk/document IDs, source key, title/source provenance,
current document version, document/chunk SHA-256 hashes, chunk index, exact content,
keyword/vector ranks, and fusion score. Scores are reciprocal-rank scores, not
probabilities or proof that a passage supports a claim. Text and provenance are
untrusted data and must be rendered safely.

All candidates are filtered by tenant, current membership, active managed source
key, organization access scope, and matching chunk/document version before ranking.
Historical revisions, tombstones, and legacy rows without source keys are excluded.
The vector path additionally requires a non-null embedding and matching model key
and embedding/chunk content hash.

- Keyword search uses PostgreSQL English `plainto_tsquery`, chunk-content
  `to_tsvector`, and `ts_rank_cd`, with a GIN expression index. Query terms are
  data, not raw tsquery syntax or SQL. All normalized query terms must match;
  titles/source metadata are returned but are not keyword-indexed.
- Vector search generates a query embedding and uses exact pgvector cosine
  distance. Candidates require distance ≤ 0.75 (similarity ≥ 0.25). This initial
  cutoff is a heuristic, not calibrated relevance confidence. It must be tuned
  on real data in the evaluation phase.
- Hybrid search combines the top 30 candidates from each path using reciprocal
  rank fusion `1/(60+rank)` per contributing path. Chunk ID breaks ties. Each
  path is bounded to 30 candidates; final results are bounded to the requested
  limit. Multiple chunks from a document can occupy results.

No approximate vector index or reranker is enabled. Exact search establishes a
small-corpus baseline; large tenants require measured latency/recall tuning before
scaling. The SQL statement has a five-second timeout and its transaction has a
seven-second timeout. Cancellation stops provider work; an already running SQL
statement is bounded by its timeout rather than a disconnect cancellation API.

## Optional embeddings

Configure these **API** environment variables before using vector/hybrid search
or indexing:

```dotenv
RUNBOOK_EMBEDDING_API_KEY=<separate OpenAI credential>
RUNBOOK_EMBEDDING_MODEL=text-embedding-3-small
```

Supported models are `text-embedding-3-small` and `text-embedding-3-large`; both
request 768 dimensions to match the existing database column. No key is needed
for keyword search. Missing configuration returns 503 for provider work. Model
changes require reindexing; incompatible vectors are excluded. Model identity
is recorded as `openai:<model>:768:v1`; provider model-alias drift is not detected
automatically and requires an explicit version/key policy before production use.

Indexing sends nonblank current chunks to the fixed HTTPS OpenAI embeddings
endpoint. Vector/hybrid search sends the query there. Redact sensitive text before
upload. Requests use a 15-second deadline, no redirects/retries, at most 128 inputs,
and a 4 MiB response bound. Responses are checked for model identity, complete
unique output indexes, 768 finite components, and nonzero float32 magnitude.
Provider bodies/credentials are not surfaced on errors. Provider requests may
incur costs; usage/billing accounting and distributed concurrency/cost budgets
remain operational work. A cancelled request may still be billed upstream.

Indexing skips whitespace-only chunks and unchanged vectors. It returns document
version, model key, indexed/skipped/updated chunk counts. It checks tenant/admin
membership before provider work and again before persistence. All vector updates
are atomic and guarded by document version/hash and chunk ID/version/hash. A
replacement/deletion during generation yields 409 without installing stale
vectors. Partial installation failures roll back. Concurrent identical indexing
may duplicate provider work, but cannot create duplicate chunk rows. Provider
failure preserves existing vectors. Replacement/deletion continues to remove old
chunk vectors transactionally. No background worker or automatic provider call
runs during ingestion/startup.

## Verification and measured comparison

The checked-in [evaluation artifact](runbook-retrieval-evaluation.json) records
five labeled development and three frozen held-out cases over three documents using manually assigned
768-dimensional vectors. Keyword Recall@3/MRR@3 are 0.6/0.6 on development, 2/3 on held-out, and
0.625/0.625 combined; vector and hybrid are 1.0/1.0 on those fixtures. The two synonym cases deliberately have no lexical
match. Measurements include local SQL/service time with a mocked embedding
provider; they exclude real provider latency/cost. These small synthetic results
verify ranking plumbing and are not evidence of real semantic quality, production
performance, or held-out accuracy. They do not justify a reranker or changing
the default. Real corpus/model and held-out evaluations remain phase 5.

With the isolated test database running, using Node 24:

```sh
cd api
npm run analytics:migrate:local
npm run test:runbooks:db
npx vitest run src/runbook
# Optional: refresh the checked-in synthetic comparison artifact.
RUNBOOK_WRITE_EVAL=1 npm run test:runbooks:db
npm run build
npm run lint
npm run schema:check
```

Database tests use real PostgreSQL/pgvector and HTTP/JWT with an explicit synthetic
embedding fixture. Transport tests mock HTTP and cover configuration, response
validation, size limits, errors, deadlines, and cancellation. No paid model calls
or production database changes are made by these verification commands. The
migration adds nullable vector provenance and the full-text index; it does not
populate embeddings or change existing document content.

Implementation references: [pgvector](https://github.com/pgvector/pgvector) and
[OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings).
