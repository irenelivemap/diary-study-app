CREATE TYPE "StudyStatus" AS ENUM ('PREPARATION', 'ACTIVE', 'CLOSED', 'ARCHIVED');

ALTER TABLE "Study"
ADD COLUMN "status" "StudyStatus" NOT NULL DEFAULT 'PREPARATION';

UPDATE "Study"
SET "status" = CASE
  WHEN "isArchived" = true THEN 'ARCHIVED'::"StudyStatus"
  WHEN "isActive" = true THEN 'ACTIVE'::"StudyStatus"
  ELSE 'PREPARATION'::"StudyStatus"
END;
