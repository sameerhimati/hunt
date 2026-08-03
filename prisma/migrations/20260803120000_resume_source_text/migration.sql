-- AlterTable
ALTER TABLE "Resume" ADD COLUMN "sourceText" TEXT;
ALTER TABLE "Resume" ADD COLUMN "sourceKind" TEXT;

-- No backfill, and unlike `Resume.archivedAt` this one leaves a real gap rather
-- than a harmless NULL: a résumé imported before this migration has no stored
-- source, so the re-read action cannot offer itself on it. That is not a
-- migration that failed to try — the text was never captured, and there is
-- nothing on disk to reconstruct it from. Re-importing the file writes it.
--
-- Both columns are NULL for a résumé started from scratch too, which is the same
-- state and the correct one: there is no source document to re-read.
