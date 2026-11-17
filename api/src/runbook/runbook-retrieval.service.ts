import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/index.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';
import { EmbeddingClient, validVector } from './embedding.client.js';
import { SearchRunbooksDto } from './search-runbooks.dto.js';

export interface RetrievedPassage {
  chunkId: string;
  documentId: string;
  sourceKey: string;
  title: string;
  source: string | null;
  version: number;
  documentHash: string;
  chunkHash: string;
  chunkIndex: number;
  content: string;
  keywordRank: number | null;
  vectorRank: number | null;
  score: number;
}
type Chunk = {
  id: string;
  content: string;
  contentHash: string;
  embeddingContentHash: string | null;
  embeddingModel: string | null;
  hasEmbedding: boolean;
};

@Injectable()
export class RunbookRetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingClient,
  ) {}

  private async authorize(
    actor: JwtPayload,
    admin = false,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    if (
      !actor?.sub ||
      !actor.organizationId ||
      (admin && actor.role !== 'ADMIN')
    )
      throw new ForbiddenException('Runbook access denied');
    if (
      !(await tx.user.findFirst({
        where: {
          id: actor.sub,
          organizationId: actor.organizationId,
          ...(admin ? { role: 'ADMIN' } : {}),
        },
        select: { id: true },
      }))
    )
      throw new ForbiddenException('Runbook access denied');
  }

  async index(sourceKey: string, actor: JwtPayload, signal?: AbortSignal) {
    if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(sourceKey))
      throw new BadRequestException('Invalid source key');
    await this.authorize(actor, true);
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: {
        organizationId: actor.organizationId,
        sourceKey,
        deletedAt: null,
      },
    });
    if (!document) throw new NotFoundException('Runbook not found');
    const chunks = await this.prisma.$queryRaw<Chunk[]>`
      SELECT c.id, c.content, c."contentHash", c."embeddingContentHash", c."embeddingModel", (c.embedding IS NOT NULL) AS "hasEmbedding"
      FROM "KnowledgeChunk" c JOIN "KnowledgeDocument" d ON d.id = c."documentId" AND d."organizationId" = c."organizationId"
      WHERE d.id = ${document.id} AND d."organizationId" = ${actor.organizationId} AND d.version = ${document.version}
      AND d."deletedAt" IS NULL AND c."documentVersion" = d.version ORDER BY c."chunkIndex"`;
    if (!chunks.length || chunks.length > 128)
      throw new ConflictException('Runbook chunks unavailable');
    const indexable = chunks.filter((c) => c.content.trim());
    const pending = indexable.filter(
      (c) =>
        !c.hasEmbedding ||
        c.embeddingModel !== this.embeddings.modelKey ||
        c.embeddingContentHash !== c.contentHash,
    );
    const vectors = pending.length
      ? await this.embeddings.embed(
          pending.map((c) => c.content),
          signal,
        )
      : [];
    signal?.throwIfAborted();
    await this.prisma.$transaction(
      async (tx) => {
        await this.authorize(actor, true, tx);
        // Lock the document using a version/hash CAS before installing any vectors.
        const locked =
          await tx.$executeRaw`UPDATE "KnowledgeDocument" SET "contentHash" = "contentHash"
        WHERE id = ${document.id} AND "organizationId" = ${actor.organizationId} AND version = ${document.version}
        AND "contentHash" = ${document.contentHash} AND "deletedAt" IS NULL`;
        if (locked !== 1)
          throw new ConflictException('Runbook changed while embedding; retry');
        for (let i = 0; i < pending.length; i++) {
          signal?.throwIfAborted();
          if (!validVector(vectors[i]))
            throw new ConflictException('Invalid embedding response');
          const changed =
            await tx.$executeRaw`UPDATE "KnowledgeChunk" SET embedding = ${JSON.stringify(vectors[i])}::vector,
          "embeddingModel" = ${this.embeddings.modelKey}, "embeddingContentHash" = ${pending[i].contentHash}
          WHERE id = ${pending[i].id} AND "documentId" = ${document.id} AND "organizationId" = ${actor.organizationId}
          AND "documentVersion" = ${document.version} AND "contentHash" = ${pending[i].contentHash}`;
          if (changed !== 1)
            throw new ConflictException(
              'Runbook changed while embedding; retry',
            );
        }
      },
      { timeout: 10000 },
    );
    return {
      sourceKey,
      version: document.version,
      model: this.embeddings.modelKey,
      indexedChunks: indexable.length,
      skippedChunks: chunks.length - indexable.length,
      updatedChunks: pending.length,
    };
  }

  async search(
    input: SearchRunbooksDto,
    actor: JwtPayload,
    signal?: AbortSignal,
  ) {
    if (
      !input ||
      typeof input.query !== 'string' ||
      !input.query.trim() ||
      input.query.length > 1000 ||
      !['keyword', 'vector', 'hybrid'].includes(input.mode ?? 'keyword') ||
      !Number.isInteger(input.limit ?? 5) ||
      (input.limit ?? 5) < 1 ||
      (input.limit ?? 5) > 10
    )
      throw new BadRequestException('Invalid runbook search');
    await this.authorize(actor);
    const mode = input.mode ?? 'keyword',
      limit = input.limit ?? 5;
    const vector =
      mode === 'keyword'
        ? null
        : (await this.embeddings.embed([input.query.trim()], signal))[0];
    if (vector !== null && !validVector(vector))
      throw new BadRequestException('Invalid query embedding');
    signal?.throwIfAborted();
    const passages = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
        return tx.$queryRaw<RetrievedPassage[]>`
        WITH eligible AS NOT MATERIALIZED (
          SELECT c.*, d."sourceKey", d.title, d.source, d.version, d."contentHash" AS "documentHash"
          FROM "KnowledgeChunk" c JOIN "KnowledgeDocument" d ON d.id = c."documentId" AND d."organizationId" = c."organizationId"
          WHERE c."organizationId" = ${actor.organizationId} AND d."organizationId" = ${actor.organizationId}
            AND d."deletedAt" IS NULL AND d."sourceKey" IS NOT NULL AND d."accessScope" = 'ORGANIZATION'
            AND c."documentVersion" = d.version
            AND EXISTS (SELECT 1 FROM "User" u WHERE u.id = ${actor.sub} AND u."organizationId" = d."organizationId")
        ), keywords AS (
          SELECT id, row_number() OVER (ORDER BY ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', ${input.query})) DESC, id)::int AS rank
          FROM eligible WHERE ${mode !== 'vector'} AND to_tsvector('english', content) @@ plainto_tsquery('english', ${input.query})
          ORDER BY rank LIMIT 30
        ), vectors AS (
          SELECT id, row_number() OVER (ORDER BY embedding <=> ${vector === null ? null : JSON.stringify(vector)}::vector, id)::int AS rank
          FROM eligible WHERE ${mode !== 'keyword'} AND embedding IS NOT NULL
            AND "embeddingModel" = ${this.embeddings.modelKey} AND "embeddingContentHash" = "contentHash"
            AND (embedding <=> ${vector === null ? null : JSON.stringify(vector)}::vector) <= 0.75
          ORDER BY rank LIMIT 30
        ), fused AS (
          SELECT COALESCE(k.id, v.id) AS id, k.rank AS "keywordRank", v.rank AS "vectorRank",
            (COALESCE(1.0 / (60 + k.rank), 0) + COALESCE(1.0 / (60 + v.rank), 0))::float8 AS score
          FROM keywords k FULL OUTER JOIN vectors v ON k.id = v.id
        )
        SELECT e.id AS "chunkId", e."documentId", e."sourceKey", e.title, e.source, e.version,
          e."documentHash", e."contentHash" AS "chunkHash", e."chunkIndex", e.content,
          f."keywordRank", f."vectorRank", f.score
        FROM fused f JOIN eligible e ON e.id = f.id ORDER BY f.score DESC, e.id LIMIT ${limit}`;
      },
      { timeout: 7000 },
    );
    return {
      mode,
      embeddingModel: vector === null ? null : this.embeddings.modelKey,
      passages,
    };
  }
}
