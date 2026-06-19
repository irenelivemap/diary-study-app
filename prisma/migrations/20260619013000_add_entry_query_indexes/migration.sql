CREATE INDEX "Entry_studyId_isPilot_date_idx" ON "Entry"("studyId", "isPilot", "date");
CREATE INDEX "Entry_studyId_isPilot_userId_idx" ON "Entry"("studyId", "isPilot", "userId");
CREATE INDEX "Entry_studyId_isPilot_submittedAt_idx" ON "Entry"("studyId", "isPilot", "submittedAt");
CREATE INDEX "Entry_partId_submittedAt_idx" ON "Entry"("partId", "submittedAt");
CREATE INDEX "Answer_entryId_idx" ON "Answer"("entryId");
CREATE INDEX "Answer_questionId_idx" ON "Answer"("questionId");
