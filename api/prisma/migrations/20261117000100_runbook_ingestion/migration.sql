-- Preserve existing knowledge rows as legacy revisions; new managed runbooks use sourceKey.
ALTER TABLE "KnowledgeDocument"
 ADD COLUMN "sourceKey" TEXT,
 ADD COLUMN "deletedAt" TIMESTAMP(3),
 ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "contentHash" TEXT,
 ADD COLUMN "chunkingVersion" TEXT NOT NULL DEFAULT 'legacy-v0',
 ADD COLUMN "accessScope" TEXT NOT NULL DEFAULT 'ORGANIZATION',
 ADD COLUMN "createdBy" TEXT,
 ADD COLUMN "updatedBy" TEXT;
UPDATE "KnowledgeDocument" SET "contentHash" = encode(sha256(convert_to("content", 'UTF8')), 'hex');
ALTER TABLE "KnowledgeDocument" ALTER COLUMN "contentHash" SET NOT NULL;
ALTER TABLE "KnowledgeDocument" ALTER COLUMN "chunkingVersion" SET DEFAULT 'unicode-1000-150-v1';
CREATE UNIQUE INDEX "KnowledgeDocument_organizationId_sourceKey_key" ON "KnowledgeDocument"("organizationId", "sourceKey");
CREATE UNIQUE INDEX "KnowledgeDocument_id_organizationId_key" ON "KnowledgeDocument"("id", "organizationId");
CREATE TABLE "KnowledgeDocumentRevision" (
 "id" TEXT NOT NULL,
 "documentId" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "version" INTEGER NOT NULL,
 "title" TEXT NOT NULL,
 "source" TEXT,
 "content" TEXT NOT NULL,
 "contentHash" TEXT NOT NULL,
 "chunkingVersion" TEXT NOT NULL,
 "createdBy" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "KnowledgeDocumentRevision_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "KnowledgeDocumentRevision_documentId_organizationId_fkey" FOREIGN KEY ("documentId", "organizationId") REFERENCES "KnowledgeDocument"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KnowledgeDocumentRevision_documentId_version_key" ON "KnowledgeDocumentRevision"("documentId", "version");
INSERT INTO "KnowledgeDocumentRevision" ("id", "documentId", "organizationId", "version", "title", "source", "content", "contentHash", "chunkingVersion", "createdAt")
 SELECT "id" || ':legacy:1', "id", "organizationId", 1, "title", "source", "content", "contentHash", 'legacy-v0', "createdAt" FROM "KnowledgeDocument";
ALTER TABLE "KnowledgeChunk" ADD COLUMN "documentVersion" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "contentHash" TEXT;
UPDATE "KnowledgeChunk" SET "contentHash" = encode(sha256(convert_to("content", 'UTF8')), 'hex');
ALTER TABLE "KnowledgeChunk" ALTER COLUMN "contentHash" SET NOT NULL;
-- Repair legacy redundant tenant fields before enforcing the composite owner relation.
UPDATE "KnowledgeChunk" c SET "organizationId" = d."organizationId" FROM "KnowledgeDocument" d WHERE c."documentId" = d."id";
ALTER TABLE "KnowledgeChunk" DROP CONSTRAINT "KnowledgeChunk_documentId_fkey";
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_organizationId_fkey" FOREIGN KEY ("documentId", "organizationId") REFERENCES "KnowledgeDocument"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
