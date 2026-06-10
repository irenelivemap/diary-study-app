-- Add capture-quality flags so researchers can filter entries at analysis time.
ALTER TABLE "Entry"
ADD COLUMN "qualityFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
