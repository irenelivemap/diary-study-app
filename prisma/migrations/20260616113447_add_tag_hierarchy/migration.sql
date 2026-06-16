-- AlterTable
ALTER TABLE "QuestionTag" ADD COLUMN     "description" TEXT,
ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "QuestionTag_parentId_idx" ON "QuestionTag"("parentId");

-- AddForeignKey
ALTER TABLE "QuestionTag" ADD CONSTRAINT "QuestionTag_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "QuestionTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;
