-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('FREE_TEXT', 'RATING', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'YES_NO', 'SCREENSHOT', 'DATE_TIME', 'CONTENT');

-- CreateEnum
CREATE TYPE "IncentiveStatus" AS ENUM ('NOT_TRACKED', 'PENDING', 'PAID', 'EXCLUDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PARTICIPANT',
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Study" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "consentText" TEXT,
    "contactEmail" TEXT,
    "inviteToken" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sequential" BOOLEAN NOT NULL DEFAULT false,
    "reminderNote" TEXT,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderTime" TEXT DEFAULT '18:00',
    "reminderSubject" TEXT,
    "reminderBody" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Study_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "instructions" TEXT,
    "targetEntries" INTEGER,
    "durationDays" INTEGER,
    "dueDate" TIMESTAMP(3),
    "unlockRule" TEXT NOT NULL DEFAULT 'AFTER_PREVIOUS_TARGET',
    "unlockAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "scaleType" TEXT NOT NULL DEFAULT 'numbers',
    "type" "QuestionType" NOT NULL,
    "options" TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT true,
    "min" INTEGER,
    "max" INTEGER,
    "showIfQuestionId" TEXT,
    "showIfValue" TEXT,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyParticipant" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentedAt" TIMESTAMP(3),
    "researcherNotes" TEXT,
    "incentiveStatus" "IncentiveStatus" NOT NULL DEFAULT 'NOT_TRACKED',

    CONSTRAINT "StudyParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" TEXT NOT NULL,
    "timezone" TEXT,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "wasShown" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerTag" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionTag" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#4f46e5',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailReminderLog" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL DEFAULT 'DAILY_ENTRY',
    "status" TEXT NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Study_inviteToken_key" ON "Study"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "StudyParticipant_studyId_userId_key" ON "StudyParticipant"("studyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_partId_userId_date_key" ON "Entry"("partId", "userId", "date");

-- CreateIndex
CREATE INDEX "AnswerTag_tagId_idx" ON "AnswerTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerTag_answerId_tagId_key" ON "AnswerTag"("answerId", "tagId");

-- CreateIndex
CREATE INDEX "QuestionTag_questionId_idx" ON "QuestionTag"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionTag_questionId_label_key" ON "QuestionTag"("questionId", "label");

-- CreateIndex
CREATE INDEX "EmailReminderLog_studyId_sentAt_idx" ON "EmailReminderLog"("studyId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailReminderLog_studyId_partId_userId_date_reminderType_key" ON "EmailReminderLog"("studyId", "partId", "userId", "date", "reminderType");

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyParticipant" ADD CONSTRAINT "StudyParticipant_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyParticipant" ADD CONSTRAINT "StudyParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerTag" ADD CONSTRAINT "AnswerTag_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerTag" ADD CONSTRAINT "AnswerTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "QuestionTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTag" ADD CONSTRAINT "QuestionTag_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailReminderLog" ADD CONSTRAINT "EmailReminderLog_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;
