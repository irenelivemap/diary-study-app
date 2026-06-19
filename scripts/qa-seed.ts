import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { resolveDatabaseUrl } from '../app/lib/database-url'

const QA_PARTICIPANT_EMAIL = process.env.QA_PARTICIPANT_EMAIL || 'qa.participant@diari.test'
const QA_PARTICIPANT_PASSWORD = process.env.QA_PARTICIPANT_PASSWORD || 'qa-participant-123'
const SIMPLE_STUDY_NAME = 'QA Smoke — Simple Diary'
const JOURNEY_STUDY_NAME = 'QA Smoke — Journey Study'

const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() })
const prisma = new PrismaClient({ adapter })

function token() {
  return randomBytes(16).toString('hex')
}

async function createFreeTextQuestion(studyId: string, partId: string, text: string, order = 1) {
  return prisma.question.create({
    data: {
      studyId,
      partId,
      page: 1,
      order,
      text,
      type: 'FREE_TEXT',
      options: [],
      required: true,
    },
  })
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } })
  if (!admin) throw new Error('No admin user found. Create an admin before running QA seed.')

  await prisma.study.deleteMany({ where: { name: { in: [SIMPLE_STUDY_NAME, JOURNEY_STUDY_NAME] } } })
  await prisma.user.deleteMany({ where: { email: QA_PARTICIPANT_EMAIL } })

  const password = await bcrypt.hash(QA_PARTICIPANT_PASSWORD, 12)
  const participant = await prisma.user.create({
    data: {
      email: QA_PARTICIPANT_EMAIL,
      password,
      name: 'QA Participant',
      firstName: 'QA',
      lastName: 'Participant',
      role: 'PARTICIPANT',
      timezone: 'Europe/Zurich',
    },
  })

  const simpleStudy = await prisma.study.create({
    data: {
      name: SIMPLE_STUDY_NAME,
      description: 'Automated QA fixture for a simple one-action diary study.',
      consentText: 'QA consent text.',
      contactEmail: admin.email,
      inviteToken: token(),
      mode: 'STANDARD',
      isActive: true,
      sequential: false,
      participantEntryAccess: 'SHOW_READ_ONLY',
    },
  })

  const simplePart = await prisma.part.create({
    data: {
      studyId: simpleStudy.id,
      name: 'Daily check-in',
      order: 1,
      instructions: 'Answer this once during the QA check.',
      flow: 'STANDARD',
      entryPolicy: 'MULTIPLE_PER_DAY',
      isActive: true,
      unlockRule: 'IMMEDIATE',
    },
  })
  await createFreeTextQuestion(simpleStudy.id, simplePart.id, 'What happened in this QA moment?')

  const journeyStudy = await prisma.study.create({
    data: {
      name: JOURNEY_STUDY_NAME,
      description: 'Automated QA fixture for a three-stage journey study.',
      consentText: 'QA journey consent text.',
      contactEmail: admin.email,
      inviteToken: token(),
      mode: 'JOURNEY',
      journeyName: 'QA moment',
      isActive: true,
      sequential: false,
      participantEntryAccess: 'SHOW_READ_ONLY',
    },
  })

  const beforePart = await prisma.part.create({
    data: {
      studyId: journeyStudy.id,
      name: 'Before the moment',
      order: 1,
      instructions: 'Answer before the moment starts.',
      flow: 'JOURNEY_STAGE',
      entryPolicy: 'MULTIPLE_PER_DAY',
      isActive: true,
      unlockRule: 'IMMEDIATE',
    },
  })
  await createFreeTextQuestion(journeyStudy.id, beforePart.id, 'What do you expect before this QA moment?')

  const duringPart = await prisma.part.create({
    data: {
      studyId: journeyStudy.id,
      name: 'During the moment',
      order: 2,
      instructions: 'Answer while the moment is happening.',
      flow: 'JOURNEY_STAGE',
      entryPolicy: 'MULTIPLE_PER_DAY',
      isActive: true,
      unlockRule: 'AFTER_PREVIOUS_TARGET',
    },
  })
  await createFreeTextQuestion(journeyStudy.id, duringPart.id, 'What is happening during this QA moment?')

  const afterPart = await prisma.part.create({
    data: {
      studyId: journeyStudy.id,
      name: 'After the moment',
      order: 3,
      instructions: 'Answer after the moment ends.',
      flow: 'JOURNEY_STAGE',
      entryPolicy: 'MULTIPLE_PER_DAY',
      isActive: true,
      unlockRule: 'AFTER_PREVIOUS_TARGET',
    },
  })
  await createFreeTextQuestion(journeyStudy.id, afterPart.id, 'What changed after this QA moment?')

  await prisma.studyParticipant.createMany({
    data: [
      { studyId: simpleStudy.id, userId: participant.id, consentedAt: new Date() },
      { studyId: journeyStudy.id, userId: participant.id, consentedAt: new Date() },
    ],
  })

  const journey = await prisma.journey.create({
    data: {
      studyId: journeyStudy.id,
      userId: participant.id,
      label: 'QA moment #1',
    },
  })

  console.log('QA fixtures ready.')
  console.log(`Participant email: ${QA_PARTICIPANT_EMAIL}`)
  console.log(`Participant password: ${QA_PARTICIPANT_PASSWORD}`)
  console.log(`Simple invite: /join/${simpleStudy.inviteToken}`)
  console.log(`Journey invite: /join/${journeyStudy.inviteToken}`)
  console.log(`Simple study id: ${simpleStudy.id}`)
  console.log(`Simple part id: ${simplePart.id}`)
  console.log(`Journey study id: ${journeyStudy.id}`)
  console.log(`Journey id: ${journey.id}`)
  console.log(`Journey first stage id: ${beforePart.id}`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
