-- C 组：RAG 向量列 + 语义缓存
-- 用 DOUBLE PRECISION[]（Prisma Float[]）而非 pgvector：当前规模下 JS 端 cosine 已足够快，
-- 且不依赖 vector 扩展。等数据量上来再迁到 pgvector。

-- AlterTable
ALTER TABLE "AITemplateCache" ADD COLUMN     "intentEmbedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
ADD COLUMN     "intentText" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "KnowledgeDoc" ADD COLUMN     "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
ADD COLUMN     "embeddingModel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "embeddingTextHash" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "AITemplateCache_task_idx" ON "AITemplateCache"("task");
