ALTER TABLE "KnowledgeChunk" ADD COLUMN "embeddingModel" TEXT, ADD COLUMN "embeddingContentHash" TEXT;
-- Exact vector search first; an ANN index needs measured corpus/recall evidence.
CREATE INDEX "KnowledgeChunk_content_fts_idx" ON "KnowledgeChunk" USING GIN (to_tsvector('english', "content"));
