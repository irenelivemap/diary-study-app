-- CreateTable
CREATE TABLE "StudyInvitation" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invitedBy" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudyInvitation_token_key" ON "StudyInvitation"("token");

-- CreateIndex
CREATE INDEX "StudyInvitation_email_idx" ON "StudyInvitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StudyInvitation_studyId_email_key" ON "StudyInvitation"("studyId", "email");

-- AddForeignKey
ALTER TABLE "StudyInvitation" ADD CONSTRAINT "StudyInvitation_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyInvitation" ADD CONSTRAINT "StudyInvitation_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
