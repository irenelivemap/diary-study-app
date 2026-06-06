CREATE TYPE "StudyMode" AS ENUM ('STANDARD', 'JOURNEY');

ALTER TABLE "Study"
ADD COLUMN "mode" "StudyMode" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "journeyName" TEXT;

CREATE TABLE "Journey" (
  "id" TEXT NOT NULL,
  "studyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Entry"
ADD COLUMN "journeyId" TEXT;

ALTER TABLE "Journey"
ADD CONSTRAINT "Journey_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Journey"
ADD CONSTRAINT "Journey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Entry"
ADD CONSTRAINT "Entry_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Journey_studyId_userId_createdAt_idx" ON "Journey"("studyId", "userId", "createdAt");
CREATE INDEX "Entry_journeyId_idx" ON "Entry"("journeyId");
CREATE UNIQUE INDEX "Entry_journeyId_partId_key" ON "Entry"("journeyId", "partId");
