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
import { PutRunbookDto } from './runbook.dto.js';
import { CHUNKING_VERSION, chunkRunbook, digest } from './chunking.js';

type Db = Prisma.TransactionClient;
const metadata = {
  id: true,
  sourceKey: true,
  title: true,
  source: true,
  version: true,
  contentHash: true,
  chunkingVersion: true,
  accessScope: true,
  createdBy: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class RunbookService {
  constructor(private readonly prisma: PrismaService) {}

  private key(key: string) {
    if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(key))
      throw new BadRequestException('Invalid source key');
  }

  private async member(db: Db, actor: JwtPayload, admin = false) {
    if (
      !actor?.sub ||
      !actor.organizationId ||
      (admin && actor.role !== 'ADMIN')
    )
      throw new ForbiddenException('Runbook access denied');
    const member = await db.user.findFirst({
      where: {
        id: actor.sub,
        organizationId: actor.organizationId,
        ...(admin ? { role: 'ADMIN' } : {}),
      },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException('Runbook access denied');
  }

  private async write<T>(operation: (tx: Db) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          (error instanceof Prisma.PrismaClientKnownRequestError &&
            ['P2002', 'P2034'].includes(error.code)) ||
          (error instanceof Error &&
            error.name === 'DriverAdapterError' &&
            (error.cause as { kind?: string } | undefined)?.kind ===
              'TransactionWriteConflict')
        ) {
          if (attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, 20 * (attempt + 1)),
            );
            continue;
          }
          throw new ConflictException(
            'Concurrent runbook change; retry with the current version',
          );
        }
        throw error;
      }
    }
  }

  async put(key: string, input: PutRunbookDto, actor: JwtPayload) {
    this.key(key);
    if (
      !input ||
      typeof input.title !== 'string' ||
      !input.title.trim() ||
      input.title.length > 200 ||
      typeof input.content !== 'string' ||
      !input.content.trim() ||
      input.content.length > 100000 ||
      (input.source !== undefined &&
        (typeof input.source !== 'string' || input.source.length > 2000)) ||
      !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion < 0 ||
      input.expectedVersion > 2147483646
    )
      throw new BadRequestException('Invalid runbook input');
    const title = input.title.trim(),
      source = input.source?.trim() || null;
    const hash = digest(input.content);
    const chunks = chunkRunbook(input.content);
    return this.write(async (tx) => {
      await this.member(tx, actor, true);
      const where = { organizationId: actor.organizationId, sourceKey: key };
      const current = await tx.knowledgeDocument.findFirst({ where });
      if (
        current &&
        !current.deletedAt &&
        current.contentHash === hash &&
        current.title === title &&
        current.source === source &&
        current.chunkingVersion === CHUNKING_VERSION
      )
        return tx.knowledgeDocument.findUniqueOrThrow({
          where: { id: current.id },
          select: metadata,
        });
      if (
        (current && !current.deletedAt ? current.version : 0) !==
        input.expectedVersion
      )
        throw new ConflictException('Runbook version conflict');
      const version = (current?.version ?? 0) + 1;
      const data = {
        title,
        source,
        content: input.content,
        contentHash: hash,
        version,
        deletedAt: null,
        chunkingVersion: CHUNKING_VERSION,
        updatedBy: actor.sub,
      };
      let id: string;
      if (current) {
        const changed = await tx.knowledgeDocument.updateMany({
          where: { ...where, version: current.version },
          data,
        });
        if (changed.count !== 1)
          throw new ConflictException('Runbook version conflict');
        id = current.id;
        await tx.knowledgeChunk.deleteMany({
          where: { documentId: id, organizationId: actor.organizationId },
        });
      } else {
        const created = await tx.knowledgeDocument.create({
          data: { ...data, ...where, createdBy: actor.sub },
        });
        id = created.id;
      }
      await tx.knowledgeDocumentRevision.create({
        data: {
          documentId: id,
          organizationId: actor.organizationId,
          version,
          title,
          source,
          content: input.content,
          contentHash: hash,
          chunkingVersion: CHUNKING_VERSION,
          createdBy: actor.sub,
        },
      });
      await tx.knowledgeChunk.createMany({
        data: chunks.map((chunk) => ({
          ...chunk,
          documentId: id,
          organizationId: actor.organizationId,
          documentVersion: version,
        })),
      });
      return tx.knowledgeDocument.findUniqueOrThrow({
        where: { id },
        select: metadata,
      });
    });
  }

  async list(actor: JwtPayload, after?: string) {
    if (
      after !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        after,
      )
    )
      throw new BadRequestException('Invalid cursor');
    await this.member(this.prisma, actor);
    return this.prisma.knowledgeDocument.findMany({
      where: {
        organizationId: actor.organizationId,
        sourceKey: { not: null },
        deletedAt: null,
        ...(after ? { id: { gt: after } } : {}),
      },
      select: metadata,
      orderBy: { id: 'asc' },
      take: 50,
    });
  }

  async get(key: string, actor: JwtPayload, version?: number) {
    this.key(key);
    await this.member(this.prisma, actor);
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: {
        organizationId: actor.organizationId,
        sourceKey: key,
        deletedAt: null,
      },
      select: { ...metadata, content: true },
    });
    if (!document) throw new NotFoundException('Runbook not found');
    if (version === undefined) return document;
    if (!Number.isInteger(version) || version < 1)
      throw new BadRequestException('Invalid version');
    const revision = await this.prisma.knowledgeDocumentRevision.findFirst({
      where: {
        documentId: document.id,
        organizationId: actor.organizationId,
        version,
      },
    });
    if (!revision) throw new NotFoundException('Runbook not found');
    return { ...revision, sourceKey: key, accessScope: document.accessScope };
  }

  async remove(key: string, expectedVersion: number, actor: JwtPayload) {
    this.key(key);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1)
      throw new BadRequestException('Invalid expected version');
    return this.write(async (tx) => {
      await this.member(tx, actor, true);
      const where = { organizationId: actor.organizationId, sourceKey: key };
      const current = await tx.knowledgeDocument.findFirst({
        where,
        select: { id: true, version: true, deletedAt: true },
      });
      if (!current || current.deletedAt) return; // Retry-safe deletion; also does not disclose other tenants' keys.
      if (current.version !== expectedVersion)
        throw new ConflictException('Runbook version conflict');
      await tx.knowledgeChunk.deleteMany({
        where: { documentId: current.id, organizationId: actor.organizationId },
      });
      await tx.knowledgeDocumentRevision.deleteMany({
        where: { documentId: current.id, organizationId: actor.organizationId },
      });
      const removed = await tx.knowledgeDocument.updateMany({
        where: { ...where, version: expectedVersion },
        data: {
          deletedAt: new Date(),
          version: { increment: 1 },
          content: '',
          contentHash: digest(''),
          title: '[deleted]',
          source: null,
          updatedBy: actor.sub,
        },
      });
      if (removed.count !== 1)
        throw new ConflictException('Runbook version conflict');
    });
  }
}
