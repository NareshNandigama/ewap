import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('serves only the authorized workflow and runbook read tools over stdio', async () => {
  const runId = '00000000-0000-4000-8000-000000000001';
  const foreignId = '00000000-0000-4000-8000-000000000002';
  const redirectId = '00000000-0000-4000-8000-000000000003';
  const seen = [];
  const api = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.push({
      url: req.url,
      method: req.method,
      authorization: req.headers.authorization,
      body: chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined,
    });
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith(runId)) {
      res.end(
        JSON.stringify({
          id: runId,
          status: 'FAILED',
          executionToken: 'unused-server-field',
          logs: Array.from({ length: 21 }, (_, id) => ({
            id,
            level: 'WARN',
            message: 'x'.repeat(1100),
            createdAt: '2026-01-01T00:00:00Z',
          })),
        }),
      );
    } else if (req.url.endsWith(foreignId)) {
      res
        .writeHead(404)
        .end(JSON.stringify({ message: 'private upstream error body' }));
    } else if (req.url.endsWith(redirectId)) {
      res.writeHead(302, { Location: '/unexpected' }).end();
    } else if (req.url === '/api/v1/runbooks/search') {
      res.end(JSON.stringify({ passages: [{ chunkId: 'synthetic-chunk' }] }));
    } else {
      res.writeHead(500).end();
    }
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const client = new Client({ name: 'ewap-smoke', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./mcp-server.mjs', import.meta.url))],
    env: {
      EWAP_MCP_TOKEN: 'synthetic-token',
      EWAP_MCP_API_ORIGIN: `http://127.0.0.1:${api.address().port}`,
    },
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'get_workflow_run',
      'search_runbooks',
    ]);
    assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true));
    const getRun = (id) =>
      client.callTool({ name: 'get_workflow_run', arguments: { runId: id } });
    const run = JSON.parse((await getRun(runId)).content[0].text);
    assert.equal(run.id, runId);
    assert.equal(run.logsTruncated, true);
    assert.equal(run.logs.length, 20);
    assert.equal(run.logs[0].id, 1);
    assert.equal(run.logs[0].message.length, 1000);
    assert.equal(run.executionToken, undefined);

    const foreign = await getRun(foreignId);
    assert.equal(foreign.isError, true);
    assert.equal(
      foreign.content[0].text,
      'EWAP API request failed (HTTP 404).',
    );
    assert.equal((await getRun(redirectId)).isError, true);
    assert.equal((await getRun('invalid')).isError, true);

    const search = await client.callTool({
      name: 'search_runbooks',
      arguments: { query: ' timeout ', limit: 2 },
    });
    assert.deepEqual(JSON.parse(search.content[0].text), {
      passages: [{ chunkId: 'synthetic-chunk' }],
    });
    assert.equal(seen.length, 4);
    assert.ok(
      seen.every(
        (request) => request.authorization === 'Bearer synthetic-token',
      ),
    );
    assert.deepEqual(seen.at(-1), {
      url: '/api/v1/runbooks/search',
      method: 'POST',
      authorization: 'Bearer synthetic-token',
      body: { query: 'timeout', limit: 2, mode: 'keyword' },
    });
  } finally {
    await client.close();
    await new Promise((resolve) => api.close(resolve));
  }
});
