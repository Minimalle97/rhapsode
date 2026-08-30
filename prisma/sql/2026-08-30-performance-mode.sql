-- prisma/sql/2026-08-30-performance-mode.sql
--
-- Performance Mode, synlighet per verk och tva sorters medaljer.
--
-- Additivt utom de tva recordingPath-kolumnerna, som togs bort i samma
-- omgang och ar bevisat tomma (se 2026-08-30-drop-recording-paths.sql).
-- Allt nytt ar nullbart eller har standardvarde.
--
--   npx prisma db push

-- AlterTable
ALTER TABLE "Medal" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'work',
ADD COLUMN     "lostAt" TIMESTAMP(3),
ADD COLUMN     "partId" TEXT;

-- AlterTable
ALTER TABLE "Performance" ADD COLUMN     "passed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Work" ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'private';

-- CreateIndex
CREATE INDEX "Medal_userId_kind_idx" ON "Medal"("userId", "kind");

-- CreateIndex
CREATE INDEX "Medal_workId_kind_idx" ON "Medal"("workId", "kind");

