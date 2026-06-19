/**
 * Checks reminder recipient selection, delivery safety, and reminder send rules.
 */
import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { sendDueReminders } from '../app/lib/reminders'
import { resolveDatabaseUrl } from '../app/lib/database-url'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')

const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() })
const prisma = new PrismaClient({ adapter })

function token() {
  return randomBytes(8).toString('hex')
}

async function createParticipant(email: string) {
  return prisma.user.create({
    data: {
      email,
      password: await bcrypt.hash('qa-reminder-123', 12),
      name: 'Reminder QA',
      role: 'PARTICIPANT',
      timezone: 'Europe/Zurich',
    },
  })
}

async function createStudy(name: string, mode: 'STANDARD' | 'JOURNEY', status: 'ACTIVE' | 'CLOSED') {
  return prisma.study.create({
    data: {
      name,
      mode,
      journeyName: mode === 'JOURNEY' ? 'QA journey' : null,
      consentText: 'QA consent.',
      contactEmail: 'qa@example.com',
      inviteToken: token(),
      status,
      isActive: status === 'ACTIVE',
      isArchived: false,
      remindersEnabled: true,
      reminderTime: '00:00',
    },
  })
}

async function createPart(studyId: string, flow: 'STANDARD' | 'JOURNEY_STAGE', order: number) {
  return prisma.part.create({
    data: {
      studyId,
      name: flow === 'JOURNEY_STAGE' ? `Stage ${order}` : 'Daily check-in',
      order,
      flow,
      entryPolicy: 'MULTIPLE_PER_DAY',
      isActive: true,
      unlockRule: order === 1 ? 'IMMEDIATE' : 'AFTER_PREVIOUS_TARGET',
    },
  })
}

async function main() {
  const runId = token()
  const createdStudyIds: string[] = []
  const createdUserIds: string[] = []

  try {
    const participant = await createParticipant(`qa.reminder.${runId}@diari.test`)
    createdUserIds.push(participant.id)

    const standardStudy = await createStudy(`QA Reminder Standard ${runId}`, 'STANDARD', 'ACTIVE')
    createdStudyIds.push(standardStudy.id)
    await createPart(standardStudy.id, 'STANDARD', 1)
    await prisma.studyParticipant.create({
      data: { studyId: standardStudy.id, userId: participant.id, consentedAt: new Date() },
    })

    const standardResult = await sendDueReminders({ studyId: standardStudy.id, force: true, dryRun: true })
    assert.equal(standardResult.configured, true)
    assert.equal(standardResult.sent, 1)
    assert.equal(standardResult.failed, 0)

    const journeyStudy = await createStudy(`QA Reminder Journey ${runId}`, 'JOURNEY', 'ACTIVE')
    createdStudyIds.push(journeyStudy.id)
    await createPart(journeyStudy.id, 'JOURNEY_STAGE', 1)
    await createPart(journeyStudy.id, 'JOURNEY_STAGE', 2)
    await prisma.studyParticipant.create({
      data: { studyId: journeyStudy.id, userId: participant.id, consentedAt: new Date() },
    })

    const journeyResult = await sendDueReminders({ studyId: journeyStudy.id, force: true, dryRun: true })
    assert.equal(journeyResult.configured, true)
    assert.equal(journeyResult.sent, 1)
    assert.equal(journeyResult.failed, 0)

    const closedStudy = await createStudy(`QA Reminder Closed ${runId}`, 'STANDARD', 'CLOSED')
    createdStudyIds.push(closedStudy.id)
    await createPart(closedStudy.id, 'STANDARD', 1)
    await prisma.studyParticipant.create({
      data: { studyId: closedStudy.id, userId: participant.id, consentedAt: new Date() },
    })

    const closedResult = await sendDueReminders({ studyId: closedStudy.id, force: true, dryRun: true })
    assert.equal(closedResult.sent, 0)
    assert.equal(closedResult.checked, 0)

    console.log('Reminder delivery checks passed.')
  } finally {
    if (createdStudyIds.length) {
      await prisma.study.deleteMany({ where: { id: { in: createdStudyIds } } })
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    }
    await prisma.$disconnect()
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error)
  await prisma.$disconnect()
  process.exit(1)
})
