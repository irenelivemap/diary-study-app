CREATE TYPE "ParticipantEntryAccess" AS ENUM ('HIDE_PAST_ENTRIES', 'SHOW_READ_ONLY');

ALTER TABLE "Study"
ADD COLUMN "participantEntryAccess" "ParticipantEntryAccess" NOT NULL DEFAULT 'SHOW_READ_ONLY';
