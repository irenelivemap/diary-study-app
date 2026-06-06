CREATE TYPE "EntryPolicy" AS ENUM ('ONCE_PER_DAY', 'MULTIPLE_PER_DAY');

ALTER TABLE "Part"
ADD COLUMN "entryPolicy" "EntryPolicy" NOT NULL DEFAULT 'ONCE_PER_DAY';

DROP INDEX IF EXISTS "Entry_partId_userId_date_key";

CREATE INDEX "Entry_partId_userId_date_idx" ON "Entry"("partId", "userId", "date");
