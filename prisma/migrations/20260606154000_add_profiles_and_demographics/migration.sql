ALTER TABLE "User"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT;

ALTER TABLE "Study"
ADD COLUMN "demographicFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "StudyParticipant"
ADD COLUMN "externalParticipantId" TEXT,
ADD COLUMN "demographics" JSONB;

ALTER TABLE "StudyInvitation"
ADD COLUMN "externalParticipantId" TEXT;

CREATE INDEX "StudyParticipant_externalParticipantId_idx" ON "StudyParticipant"("externalParticipantId");
