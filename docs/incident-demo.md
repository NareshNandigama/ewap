# Failed release demo

Investigate a synthetic release failure, compare runbook revisions, and hand
the same evidence to an external AI client using the read-only MCP tools.
The demo creates fresh organizations and records in the standalone local
`ewap` database. Existing team records are outside those organizations.

## Seed and verify

With the local API, PostgreSQL, and Redis running and `GEMINI_API_KEY`
configured in the API, execute from the repo root:

```sh
node --env-file=api/.env api/scripts/incident-demo.mjs seed
node api/scripts/incident-demo.mjs check <manifest-path>
```

The seed prints the run IDs and the path to a private JSON file with demo
login credentials. Sign in at [localhost:3001](http://localhost:3001/login)
using the `owner` account from that file. The `foreign` account represents
another organization. Keep the file private and remove it when finished.

The standard check needs no paid model call. It verifies current-version
retrieval, tenant isolation for runs and runbooks, retrieval of both sides of
the conflicting guidance, abstention without failure logs, and the MCP read
path. This leaves the synthetic organizations available for manual review.

## Walk through the incident

| Run | Ask Gemini Multi-Agent | Look for |
| --- | --- | --- |
| `failedRelease` | `connection timeout` | A timestamped incident timeline tied to exact logs, plus guidance from `worker-timeout` v2. |
| `missingEvidence` | `connection timeout` | Insufficient evidence because warning and error logs are unavailable. |
| `conflictingGuidance` | `rollback window` | Both policy excerpts if Gemini identifies the conflict, plus a question for the operator about which policy governs the release. |

The workflow investigator and runbook researcher select evidence in parallel.
The synthesis agent can pair their validated quotes or surface potentially
conflicting passages. The displayed guidance remains a suggestion for human
review. A separate MCP client can read the same failed run and search for
`connection timeout` using the owner's EWAP token. [MCP client setup](mcp.md)

For a live Gemini scorecard, add `--live`:

```sh
node api/scripts/incident-demo.mjs check <manifest-path> --live
```

This adds at most two diagnostic requests using synthetic evidence and stops
after the first failure. It records elapsed time, HTTP status, citation or
abstention outcome, and aggregate input and output tokens when Gemini reports
usage for every completed agent call. Output includes reported thinking tokens.
The scorecard is a scenario check, and token counts are usage measurements.
