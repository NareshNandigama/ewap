# EWAP Agent Architecture Benchmark

Compare one Gemini call with the three-agent workflow using identical frozen
evidence snapshots, Gemini configuration, final output limits, provenance
checks, and a 35-second deadline per strategy. The multi-agent flow also
checks that its final citations match the specialists' selections. The
benchmark-only single-call strategy leaves the existing application path
on multi-agent diagnostics.

The fixture set has three development cases and three held-out cases. It
covers a supported diagnosis, missing logs, conflicting policies, a current
revision, a synonym-related keyword miss, and rejected foreign citations.
The offline test injects a foreign passage ID and a provider failure. The
existing local incident scorecard separately checks actual tenant authorization
and current-version retrieval through the API.

## Offline regression

From the repo root:

    yarn --cwd api vitest run src/ai/gemini-grounded-diagnostics.service.spec.ts

The regression replays six cases against both strategies and checks their
outcomes and model-call counts. Provider responses and usage values are
scripted, so these results measure the execution contract. Snapshot Recall@5
describes which labeled passages appear in the frozen retrieval snapshot.
The runner reuses these snapshots for a fair architecture comparison. The
[retrieval evaluation](runbook-retrieval.md) exercises the database ranking
separately.

## Live evaluation

Build the API and run the same synthetic cases using the local Gemini key:

    yarn --cwd api build
    node --env-file=api/.env api/scripts/agent-benchmark-live.mjs --smoke
    node --env-file=api/.env api/scripts/agent-benchmark-live.mjs --development
    node --env-file=api/.env api/scripts/agent-benchmark-live.mjs --heldout

Smoke runs one pair, and the full comparisons run one pair per case in the
selected split. The runner stops when a provider call is unavailable.
The report contains labels, outcomes, citation correctness, observed latency,
model-call counts, and reported usage where available. An unavailable
response has unknown usage and call count. Treat latency and token counts as
measurements for these benchmark requests. A single pass over six synthetic
cases is a smoke evaluation. Broader model quality and production ROI need
representative cases and operator measurements.

## Verified offline results

| Strategy | Fixture outcomes matched | Scripted provider calls |
| --- | ---: | ---: |
| Single call | 6 of 6 | 4 |
| Three-agent workflow | 6 of 6 | 12 |

Both strategies skipped model calls on missing logs and on the keyword-miss
snapshot. Both reported a simulated provider failure as unavailable. The
scripted call totals establish the work each strategy performed during the
replay. Choosing an approach on quality or cost requires live results.

## Live timeout smoke

On November 22, 2026, both strategies cited the expected evidence on the
synthetic timeout case using Gemini 3.6 Flash.

| Strategy | Outcome | Time | Input tokens | Output tokens |
| --- | --- | ---: | ---: | ---: |
| Single call | Supported | 22.6 s | 148 | 97 |
| Three-agent workflow | Supported | 33.0 s | 343 | 183 |

For this case, both passed the same citation checks and the single-call
baseline used fewer tokens and finished sooner. One case gives no estimate
of how often either strategy finds the better evidence across incident types.

The development rerun returned a passing single-call report in 20.4 seconds
with 148 input and 97 output tokens. The three-agent request was unavailable
at the 35-second deadline. The runner stopped there, so development coverage
is partial and the held-out run is pending. This highlights a reliability
difference to investigate before drawing an architecture conclusion.
