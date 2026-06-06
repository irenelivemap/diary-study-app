ALTER TABLE "Part"
ADD COLUMN "flow" TEXT NOT NULL DEFAULT 'STANDARD';

UPDATE "Part"
SET "flow" = 'JOURNEY_STAGE'
FROM "Study"
WHERE "Part"."studyId" = "Study"."id"
  AND "Study"."mode" = 'JOURNEY';
