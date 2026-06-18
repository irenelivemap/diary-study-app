ALTER TABLE "QuestionTag" ADD COLUMN "isTheme" BOOLEAN NOT NULL DEFAULT false;

UPDATE "QuestionTag" AS parent
SET "isTheme" = true
WHERE EXISTS (
  SELECT 1
  FROM "QuestionTag" AS child
  WHERE child."parentId" = parent."id"
);
