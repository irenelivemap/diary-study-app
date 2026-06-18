ALTER TABLE "QuestionTag"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    "id",
    (ROW_NUMBER() OVER (
      PARTITION BY "questionId", COALESCE("parentId", '')
      ORDER BY "label" ASC, "createdAt" ASC, "id" ASC
    ) - 1) * 1000 AS "nextOrder"
  FROM "QuestionTag"
)
UPDATE "QuestionTag"
SET "sortOrder" = ranked."nextOrder"
FROM ranked
WHERE "QuestionTag"."id" = ranked."id";
