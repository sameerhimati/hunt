-- AlterTable
ALTER TABLE "Application" ADD COLUMN "offeredAt" DATETIME;

-- Backfill. The funnel now reads "reached Offer" off this column instead of the
-- current status, so without this every offer that already happened would read
-- as zero on the dashboard while the board six inches away still shows the card
-- sitting in Offer. It has to ride with the column, not follow it.
--
-- The rule is deliberately narrow: only rows *currently in* `offer` are stamped.
-- A `rejected` row might be an interview that ended in a no, or an offer that
-- was declined or rescinded — the old schema wrote `decidedAt` for both and kept
-- nothing that tells them apart. Inventing an offer that never arrived is a
-- worse lie than undercounting one that did, so those rows stay null and only
-- decisions made from here on, which stamp `offeredAt` on the way into `offer`,
-- are counted.
--
-- `decidedAt` is when the card entered `offer` under the old code, which is the
-- closest thing to the truth the row still holds. `updatedAt` is the fallback
-- for a row written straight into `offer` without passing through a transition,
-- where the only honest statement left is "no later than this".
UPDATE "Application"
SET "offeredAt" = COALESCE("decidedAt", "updatedAt")
WHERE "status" = 'offer' AND "offeredAt" IS NULL;
