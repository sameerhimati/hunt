-- AlterTable
ALTER TABLE "Resume" ADD COLUMN "archivedAt" DATETIME;

-- No backfill, and that is the whole point: SQLite fills the new column with
-- NULL for every existing row, and NULL *is* "not archived". Every résumé an
-- existing user already has keeps showing up in the list exactly as before, so
-- there is no old-world state this column has to reconstruct — unlike
-- `Application.offeredAt`, which changed how an existing number was computed and
-- had to carry a backfill to stay true.
