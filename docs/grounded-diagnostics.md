# Grounded diagnostics and evaluation

Task 4 phase 4 connects the authorized runbook retriever to Python's diagnostic
graph. Phase 5 adds separate development/held-out fixtures and offline/live
runners. Live provider acceptance is still pending: the bounded development
smoke check returned HTTP 429, recorded in
[grounding-live-smoke.json](grounding-live-smoke.json). It is not a passing
model-quality result. No production deployment was performed.

Two bounded requests were made for the same synthetic development case; the
second classified the rejection as HTTP 429. Further attempts stopped.

## Use the grounded path

On a workflow run, choose **Gemini Multi-Agent** and enter a short search
phrase such as `connection timeout`. It uses the API's `GEMINI_API_KEY` and
PostgreSQL keyword search. This mode can run without Python or an embedding
provider. API callers can select it with `"groundingProvider": "gemini"`
alongside `"retrievalMode": "keyword"`. The response source is
`gemini-grounded`. Requests without a grounding provider still use Python
for grounded diagnostics.
Set `GEMINI_GROUNDING_MODEL` in the API environment to select a different
Gemini model that supports structured output.

The API resolves the authorized workflow and runbook evidence before invoking
the agents. The workflow investigator selects quotes from up to 20 recent
warnings or errors. The runbook researcher independently selects quotes from
up to five matching passages. After validating both selections, the
synthesis agent pairs the exact quotes. Each role uses the same Gemini key.
The flow makes up to three model calls within a shared 35-second deadline and
uses the API's existing request quota. There are no calls when either input
snapshot is empty, and synthesis is skipped if a specialist finds no valid
quote. Agents only see the evidence needed for their assigned step and have
no direct access to the database. Log and passage text is sent to Gemini.

Configure the existing authenticated Python integration. Python deterministic
mode works and abstains; for model-selected observations, enable Python LLM mode
as described in the [service README](../ai-service/README.md). Use an API Python
deadline such as 20 seconds with Python's default 15-second graph deadline.

```http
POST /api/v1/ai/agent/diagnose
Authorization: Bearer <user-jwt>
Content-Type: application/json

{
  "question": "connection timeout",
  "workflowRunId": "<authorized-run-uuid>",
  "retrievalMode": "keyword"
}
```

A grounded question must contain 3–1,000 JavaScript string code units. Retrieval
mode is `keyword`, `vector`, or `hybrid`; vector/hybrid additionally require the
opt-in embedding configuration. Omit retrievalMode to preserve the older
ungrounded diagnostics/fallback behavior. The existing shared AI request quota
applies once at ingress. See [retrieval](runbook-retrieval.md) for indexing and
search behavior. The first version searches the supplied question directly;
long natural-language questions can overconstrain English lexical AND search.

The API authorizes the run before retrieving any runbooks or calling Python.
Retrieval uses current tenant membership and active document versions. Client
passages, tenant IDs, and citation metadata are not accepted. The API projects
at most five passages into an explicit snapshot with chunk/document IDs, source
key, version, document/chunk hashes, and exact content. Python retains no database
access or request history. Responses use `source: python-grounded` and include
`diagnostics.grounding` with status, accepted observations, and the exact source
snapshot. Source versions/hashes describe retrieval time; a concurrent edit
while the model runs does not silently relabel that snapshot as a newer version.

Both Python and NestJS validate observations against the authorized snapshot.
Each has `claim`, `log_id`, `log_quote`, `passage_id`, and `passage_quote`. A
published claim must equal its exact log quote (8–500 characters), from a supplied
ERROR/WARN log. The runbook excerpt must occur verbatim in a supplied passage.
Python also validates the chunk-content SHA-256. NestJS checks the echoed passage
IDs, versions, hashes and content against its request and rejects source changes,
invented quotes, missing context, and unsupported paraphrases.

This is deliberately **extractive support**, not a general semantic-entailment
verifier. An observed log excerpt is not proof the log is true. A related runbook
excerpt is not a verified fix, evidence of applicability, or causal proof. Model
text cannot promote a root cause to confirmed. The rendered answer explicitly
keeps root cause undetermined (or not applicable for nonfailure status), labels
references accordingly, and does not publish free-form model causal claims.
Source content remains untrusted data; callers must redact secrets before upload
and safely render excerpts. No tools or commands execute from logs/runbooks.

The graph treats question, logs, and sources as data. It requests abstention on
conflicting, irrelevant, or instruction-like evidence; whether a real model
reliably selects appropriate references remains a live evaluation question.
Mechanical quote checks alone do not establish semantic relevance or prompt
injection resistance. The evaluation labels test those selection expectations.

Empty retrieval/no warning or error logs skip the model and return
`insufficient_evidence`, with no model usage. Deterministic Python also returns
that status. Invalid individual extractive claims are discarded; if none survive,
the report abstains. Malformed/provider failures return 503 on the grounded path
and do not fall back to ungrounded TypeScript answers. Cancellation propagates
from the browser/API through Python to provider work. The API adds a 35-second
abort signal for retrieval/model work; underlying SQL is bounded by the existing
statement timeout rather than cancelled via Prisma on disconnect. Usage covers
successful model calls only; failed/retried work may still be billed upstream.

## Evaluation gates

[grounding-cases.json](../ai-service/evaluations/grounding-cases.json) has six
**development** and six separately identified **heldout** cases. Keep held-out
labels fixed when changing prompts; use development cases for tuning. Categories
include supported observations, source versions, missing evidence, foreign
citation IDs, causal paraphrases, forged quotes, injection attempts, successful
status, and conflicting sources. Synthetic strings contain no application data.

Offline evaluation drives the actual graph with scripted candidate responses.
It verifies the filtering/abstention contract and frozen label expectations;
it does not measure a real model's choices. The checked-in
[offline artifact](grounding-evaluation.json) records 12/12 passing contract
cases, per-split counts, local latency percentiles and explicitly simulated usage.
The PostgreSQL comparison now includes five development and three held-out
synthetic retrieval cases in [the retrieval artifact](runbook-retrieval-evaluation.json).
Exact quote/source/tenant isolation is also checked independently with real
PostgreSQL → NestJS HTTP → Python HTTP/LangGraph and a mocked model transport.

From the repository root:

```sh
ai-service/.venv/bin/python -m pytest ai-service/tests
ai-service/.venv/bin/python -m ewap_ai.evaluate \
  --cases ai-service/evaluations/grounding-cases.json --split all \
  --provider mock --output docs/grounding-evaluation.json
cd api
npm run test:runbooks:db
npm run test:grounding:db
npx vitest run src/ai/python-diagnostics.client.spec.ts src/ai/grounded-diagnostics.service.spec.ts src/ai/workflow-diagnostics.service.spec.ts src/ai/ai.controller.spec.ts
npm run build
npm run lint
npm run schema:check
```

The database commands require the guarded local test database running, and the
cross-process grounding test requires `ai-service/.venv` dependencies. It creates
and cleans up an ephemeral authenticated loopback Python fixture, not a deployed
service. No embeddings or actual providers are called by these tests.

After resolving the provider's 429 response, run **development** real-provider
checks first, then the frozen held-out split without tuning to its results:

```sh
# Export credentials into the process environment; never commit them.
export AI_ANALYSIS_MODE=llm
export AI_MODEL=<approved-compatible-model>
export AI_MODEL_MAX_ATTEMPTS=1
export AI_MODEL_DEADLINE_SECONDS=25
# OPENAI_API_KEY must already be exported.
ai-service/.venv/bin/python -m ewap_ai.evaluate \
  --cases ai-service/evaluations/grounding-cases.json --split development \
  --provider openai --output /tmp/grounding-development-live.json
ai-service/.venv/bin/python -m ewap_ai.evaluate \
  --cases ai-service/evaluations/grounding-cases.json --split heldout \
  --provider openai --output /tmp/grounding-heldout-live.json
```

Live commands can incur provider charges. The configured graph retains its
input/output/deadline/concurrency bounds. Results contain only case IDs, split,
category, outcome, sanitized failure reason, latency, and successful-call token
usage, not prompts, credentials, or model text. For a cost estimate, supply both
`--input-usd-per-million` and `--output-usd-per-million` using the approved current
model prices. Cached pricing, failed/retried calls, and provider billing adjustments
are not accounted for. `usageComplete: false` means an unavailable call prevents
complete accounting, not zero spend. Any failed expectation exits nonzero.

Do not declare model quality accepted until live development/held-out gates pass
and real-corpus retrieval, semantic relevance, injection, latency, and cost limits
are reviewed. The current small fixtures and extractive validator do not establish
production quality, comprehensive redaction, billing accuracy, or complete
observability. The remaining acceptance gate is explicitly tracked in the roadmap.
