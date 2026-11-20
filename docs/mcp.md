# EWAP MCP tools

Connect a local MCP client to a running EWAP API to read a workflow run or
search runbooks. The adapter authenticates each request with your EWAP access
token. The API applies the same organization checks and search quotas as it
does for browser requests.

| Tool | Inputs | Result |
| --- | --- | --- |
| `get_workflow_run` | `runId` (UUID) | Run status, workflow name, and up to 20 recent log entries. |
| `search_runbooks` | `query`, optional `limit` (1–5) | Matching current runbook passages, with version and source metadata. |

## Connect a client

Start the API and Redis normally. Sign into the local EWAP site and use the
current EWAP access token from that browser session. You can find it under
`ewap_access_token` in the site's Local Storage. Put it in a private file
outside the repository as `EWAP_MCP_TOKEN=<your access token>`. Refresh the
file and restart the MCP client when the token expires. A member account can
use both tools.

Configure a **stdio** server with the absolute path to Node 24 as its command
and the absolute path to `api/scripts/mcp-server.mjs` as its first argument.
For example, in a client that supports an `mcpServers` configuration:

```json
{
  "mcpServers": {
    "ewap": {
      "command": "/absolute/path/to/node",
      "args": [
        "--env-file=/absolute/path/to/private/ewap-mcp.env",
        "/absolute/path/to/ewap/api/scripts/mcp-server.mjs"
      ],
      "env": {
        "EWAP_MCP_API_ORIGIN": "http://127.0.0.1:3000"
      }
    }
  }
}
```

You can also provide the token through the client's secret environment settings.
For the local Docker stack, use `http://127.0.0.1:18080` as the API origin.
The adapter accepts loopback origins and refuses redirects. The client can
receive workflow logs and runbook text, so use an approved client for your data.
Tool calls use existing HTTP endpoints and keyword search without a Gemini or
embedding call. Any model usage by the connected client is managed by that client.

From the repository root, run the transport and authorization forwarding check:

```sh
node --test api/scripts/mcp-server.test.mjs
```

[MCP stdio transport](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/stdio.md)
