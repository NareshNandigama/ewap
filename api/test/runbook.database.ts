import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
/** Real PostgreSQL + HTTP/JWT, restricted to the isolated local test DB. */
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { RunbookModule } from '../src/runbook/runbook.module.js';
import { RunbookService } from '../src/runbook/runbook.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { digest } from '../src/runbook/chunking.js';
import { analyticsTestClient } from './analytics-test-db.js';

const db = analyticsTestClient();
const prefix = `runbook-${randomUUID()}`;
const input = {
  title: 'Retry guide',
  source: 'https://example.invalid/runbook',
  content: 'Check retry logs.\n'.repeat(100),
  expectedVersion: 0,
};

describe('Runbook ingestion and ownership', () => {
  let app: INestApplication, base: string, org: string, otherOrg: string;
  let admin: { sub: string; organizationId: string; role: string },
    member: typeof admin,
    other: typeof admin;
  let token: string, memberToken: string, otherToken: string;
  async function request(
    path: string,
    method = 'GET',
    jwt = token,
    body?: unknown,
  ) {
    return fetch(`${base}/runbooks${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  beforeAll(async () => {
    await db.$connect();
    org = (await db.organization.create({ data: { name: prefix } })).id;
    otherOrg = (
      await db.organization.create({ data: { name: `${prefix}-other` } })
    ).id;
    async function user(organizationId: string, role: string) {
      const row = await db.user.create({
        data: {
          organizationId,
          role,
          name: prefix,
          email: `${randomUUID()}@example.invalid`,
          passwordHash: 'test-only-no-login',
        },
      });
      return { sub: row.id, organizationId, role };
    }
    admin = await user(org, 'ADMIN');
    member = await user(org, 'MEMBER');
    other = await user(otherOrg, 'ADMIN');
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: randomBytes(32).toString('hex'),
              RATE_LIMIT_ENABLED: false,
            }),
          ],
        }),
        RunbookModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    const jwt = module.get(JwtService);
    token = jwt.sign(admin);
    memberToken = jwt.sign(member);
    otherToken = jwt.sign(other);
  });
  afterAll(async () => {
    if (app) await app.close();
    // Delete only this test's organizations and users; documents cascade.
    await db.user.deleteMany({
      where: { organizationId: { in: [org, otherOrg].filter(Boolean) } },
    });
    await db.organization.deleteMany({
      where: { id: { in: [org, otherOrg].filter(Boolean) } },
    });
    await db.$disconnect();
  });

  it('rejects unauthenticated/member writes and validates input', async () => {
    expect((await request('/guide', 'PUT', '', input)).status).toBe(401);
    expect((await request('/guide', 'PUT', memberToken, input)).status).toBe(
      403,
    );
    for (const body of [
      { ...input, title: ' ' },
      { ...input, content: '' },
      { ...input, expectedVersion: -1 },
      { ...input, expectedVersion: '0' },
    ])
      expect((await request('/invalid', 'PUT', token, body)).status).toBe(400);
    expect((await request('/INVALID', 'PUT', token, input)).status).toBe(400);
    expect(
      await db.knowledgeDocument.count({ where: { organizationId: org } }),
    ).toBe(0);
  });

  it('ingests atomically, isolates tenants, and makes identical retries a no-op', async () => {
    const response = await request('/guide', 'PUT', token, {
      ...input,
      organizationId: otherOrg,
      accessScope: 'PUBLIC',
      createdBy: other.sub,
    });
    expect(response.status).toBe(200);
    const created = await response.json();
    expect(created).toMatchObject({
      version: 1,
      contentHash: digest(input.content),
      accessScope: 'ORGANIZATION',
      createdBy: admin.sub,
    });
    const chunks = await db.knowledgeChunk.findMany({
      where: { documentId: created.id },
      orderBy: { chunkIndex: 'asc' },
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(
      chunks.every(
        (c) =>
          c.organizationId === org &&
          c.documentVersion === 1 &&
          c.contentHash === digest(c.content),
      ),
    ).toBe(true);
    const retry = await (await request('/guide', 'PUT', token, input)).json();
    expect(retry).toEqual(created);
    expect(
      await db.knowledgeDocumentRevision.count({
        where: { documentId: created.id },
      }),
    ).toBe(1);
    expect((await request('/guide', 'GET', otherToken)).status).toBe(404);
    expect((await request('/guide/versions/1', 'GET', otherToken)).status).toBe(
      404,
    );
    expect(await (await request('', 'GET', otherToken)).json()).toEqual([]);
    expect((await request('/guide', 'GET', memberToken)).status).toBe(200);
    expect(
      (
        await request('/guide', 'PUT', otherToken, {
          ...input,
          content: 'Other tenant private',
        })
      ).status,
    ).toBe(200);
    expect((await (await request('/guide')).json()).content).toBe(
      input.content,
    );
  });

  it('replaces chunks while preserving immutable versions and rejecting stale updates', async () => {
    const updated = await (
      await request('/guide', 'PUT', token, {
        ...input,
        content: 'Updated instructions',
        expectedVersion: 1,
      })
    ).json();
    expect(updated.version).toBe(2);
    const old = await (await request('/guide/versions/1')).json();
    expect(old.content).toBe(input.content);
    const chunks = await db.knowledgeChunk.findMany({
      where: { documentId: updated.id },
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      content: 'Updated instructions',
      documentVersion: 2,
    });
    expect((await request('/guide', 'PUT', token, input)).status).toBe(409);
    expect((await request('/guide?expectedVersion=1', 'DELETE')).status).toBe(
      409,
    );
    expect((await request('/guide/versions/99')).status).toBe(404);
  });

  it('deduplicates concurrent creates and permits only one conflicting replacement', async () => {
    const creates = await Promise.all(
      Array.from({ length: 4 }, () => request('/race', 'PUT', token, input)),
    );
    expect(creates.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    const revisions = await db.knowledgeDocumentRevision.count({
      where: { document: { organizationId: org, sourceKey: 'race' } },
    });
    expect(revisions).toBe(1);
    const changes = await Promise.all(
      ['A', 'B'].map((content) =>
        request('/race', 'PUT', token, {
          ...input,
          content,
          expectedVersion: 1,
        }),
      ),
    );
    expect(changes.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('rolls back document/revision replacement when chunk persistence fails', async () => {
    const before = await (await request('/guide')).json();
    const prisma = {
      $transaction: (operation, options) =>
        db.$transaction(
          (tx) =>
            operation(
              new Proxy(tx, {
                get(target, prop) {
                  return prop === 'knowledgeChunk'
                    ? {
                        ...target.knowledgeChunk,
                        createMany: vi
                          .fn()
                          .mockRejectedValue(
                            new Error('synthetic chunk failure'),
                          ),
                      }
                    : target[prop];
                },
              }),
            ),
          options,
        ),
    };
    const service = new RunbookService(prisma as unknown as PrismaService);
    await expect(
      service.put(
        'guide',
        { ...input, content: 'should rollback', expectedVersion: 2 },
        admin,
      ),
    ).rejects.toThrow('synthetic chunk failure');
    expect(await (await request('/guide')).json()).toEqual(before);
    expect(
      await db.knowledgeDocumentRevision.count({
        where: { documentId: before.id },
      }),
    ).toBe(2);
    expect(
      (await db.knowledgeChunk.findFirst({ where: { documentId: before.id } }))
        ?.content,
    ).toBe('Updated instructions');
  });

  it('deletes content, revisions and chunks; stale retries cannot delete a recreated source', async () => {
    const old = await (await request('/guide')).json();
    expect((await request('/guide?expectedVersion=2', 'DELETE')).status).toBe(
      204,
    );
    expect((await request('/guide?expectedVersion=2', 'DELETE')).status).toBe(
      204,
    );
    expect((await request('/guide')).status).toBe(404);
    expect((await request('/guide/versions/1')).status).toBe(404);
    expect(
      await db.knowledgeChunk.count({ where: { documentId: old.id } }),
    ).toBe(0);
    expect(
      await db.knowledgeDocumentRevision.count({
        where: { documentId: old.id },
      }),
    ).toBe(0);
    expect(
      (await db.knowledgeDocument.findUniqueOrThrow({ where: { id: old.id } }))
        .content,
    ).toBe('');
    const fresh = await (await request('/guide', 'PUT', token, input)).json();
    expect(fresh.version).toBeGreaterThan(2);
    expect((await request('/guide?expectedVersion=2', 'DELETE')).status).toBe(
      409,
    );
    expect(
      (
        await request('/guide', 'PUT', token, {
          ...input,
          content: 'stale replacement',
          expectedVersion: 2,
        })
      ).status,
    ).toBe(409);
  });

  it('enforces chunk tenant ownership in PostgreSQL and paginates scoped metadata', async () => {
    const document = await db.knowledgeDocument.findFirstOrThrow({
      where: { organizationId: org, sourceKey: 'guide' },
    });
    await expect(
      db.knowledgeChunk.create({
        data: {
          documentId: document.id,
          organizationId: otherOrg,
          chunkIndex: 999,
          documentVersion: document.version,
          content: 'foreign',
          contentHash: digest('foreign'),
        },
      }),
    ).rejects.toThrow();
    await db.knowledgeDocument.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({
        organizationId: org,
        sourceKey: `page-${i}`,
        title: 'Page fixture',
        content: 'fixture',
        contentHash: digest('fixture'),
      })),
    });
    const first = await (await request('')).json();
    expect(first).toHaveLength(50);
    expect(
      first.every((row) => row.content === undefined && row.sourceKey !== null),
    ).toBe(true);
    const second = await (await request(`?after=${first.at(-1).id}`)).json();
    expect(second.length).toBeGreaterThan(0);
    expect(new Set([...first, ...second].map((row) => row.id)).size).toBe(53);
  });

  it('backfills legacy hashes/revisions and repairs chunk ownership without dropping content', async () => {
    const pool = new Pool({
      connectionString: process.env.ANALYTICS_TEST_DATABASE_URL,
      ssl: false,
    });
    const connection = await pool.connect();
    const schema = `runbook_migration_${randomUUID().replaceAll('-', '')}`;
    try {
      await connection.query('BEGIN');
      await connection.query(`CREATE SCHEMA "${schema}"`);
      await connection.query(`SET LOCAL search_path TO "${schema}", public`);
      await connection.query(
        'CREATE TABLE "Organization" ("id" TEXT PRIMARY KEY)',
      );
      const baseline = readFileSync(
        new URL(
          '../prisma/migrations/20261027024547_add_knowledge_base/migration.sql',
          import.meta.url,
        ),
        'utf8',
      );
      await connection.query(baseline);
      await connection.query(
        `INSERT INTO "Organization" ("id") VALUES ('legacy-org')`,
      );
      await connection.query(
        `INSERT INTO "KnowledgeDocument" ("id", "organizationId", "title", "content", "updatedAt") VALUES ('legacy-doc', 'legacy-org', 'Original', 'Legacy 😀 content', NOW())`,
      );
      await connection.query(
        `INSERT INTO "KnowledgeChunk" ("id", "documentId", "organizationId", "chunkIndex", "content") VALUES ('legacy-chunk', 'legacy-doc', 'wrong-tenant', 0, 'Legacy 😀 content')`,
      );
      await connection.query(
        readFileSync(
          new URL(
            '../prisma/migrations/20261117000100_runbook_ingestion/migration.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      const doc = (await connection.query('SELECT * FROM "KnowledgeDocument"'))
        .rows[0];
      expect(doc.content).toBe('Legacy 😀 content');
      expect(doc.contentHash).toBe(digest(doc.content));
      expect(doc.sourceKey).toBeNull();
      expect(doc.chunkingVersion).toBe('legacy-v0');
      const revision = (
        await connection.query('SELECT * FROM "KnowledgeDocumentRevision"')
      ).rows[0];
      expect(revision.content).toBe(doc.content);
      expect(revision.version).toBe(1);
      const chunk = (await connection.query('SELECT * FROM "KnowledgeChunk"'))
        .rows[0];
      expect(chunk.organizationId).toBe('legacy-org');
      expect(chunk.contentHash).toBe(doc.contentHash);
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
      await pool.end();
    }
  });

  it('revalidates revoked administrator membership', async () => {
    await db.user.update({
      where: { id: admin.sub },
      data: { role: 'MEMBER' },
    });
    expect((await request('/guide', 'PUT', token, input)).status).toBe(403);
    expect((await request('/guide?expectedVersion=4', 'DELETE')).status).toBe(
      403,
    );
    await db.user.delete({ where: { id: member.sub } });
    expect((await request('/guide', 'GET', memberToken)).status).toBe(403);
  });
});
