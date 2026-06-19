import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { resolveDatabaseUrl } from '../app/lib/database-url'

const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() })
const prisma = new PrismaClient({ adapter })

const STUDY_NAME = 'Demo Study — Support Request Journey'
const JOURNEY_NAME = 'support request'
const OTHER_SENTINEL = '__OTHER__'

const PARTICIPANTS = [
  ['Marta Silva', 'marta.support@example.com'],
  ['Ben Schneider', 'ben.support@example.com'],
  ['Priya Nair', 'priya.support@example.com'],
  ['Elias Hoffmann', 'elias.support@example.com'],
  ['Yara Lopes', 'yara.support@example.com'],
] as const

const ISSUE_TYPES = ['Account access', 'Billing question', 'Bug / error', 'Setup help', 'Feature question', 'Data export', 'Notification issue']
const CHANNELS = ['Email', 'Live chat', 'Phone', 'Help center', 'In-app message']
const PROVIDED_INFO = ['Screenshots', 'Error message', 'Account email', 'Steps to reproduce', 'Order / invoice number', 'Device details']
const SUPPORT_FRICTIONS = ['Waiting time', 'Repeating information', 'Unclear instructions', 'Wrong channel', 'No ownership', 'Too many steps']
const OUTCOMES = ['Resolved completely', 'Partly resolved', 'Workaround found', 'Still unresolved']

const BEFORE_NOTES = [
  'I need to understand why the export keeps failing before I can finish my report.',
  'I am not sure whether this is a billing problem or a permissions problem.',
  'I tried the help article, but it did not match what I see in the app.',
  'I want a quick answer because this blocks work for someone else too.',
]

const DURING_NOTES = [
  'The agent understood the issue quickly once I shared a screenshot.',
  'I had to repeat the same context after being transferred.',
  'The instructions were clear, but I needed to test each step while chatting.',
  'The wait was longer than expected, but the answer was specific.',
]

const AFTER_NOTES = [
  'The most useful part was getting a concrete next step instead of a generic help article.',
  'The issue was solved, but I had to provide the same information twice.',
  'A better triage question at the start would have saved time.',
  'The explanation made sense and I would use the same channel again.',
]

function pick<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

function sample<T>(items: readonly T[], min: number, max: number) {
  const count = Math.floor(Math.random() * (max - min + 1)) + min
  return [...items].sort(() => Math.random() - 0.5).slice(0, count)
}

function numberBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function dateDaysAgo(daysAgo: number) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

function submittedAt(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:${String(numberBetween(0, 59)).padStart(2, '0')}:00`)
}

async function answer(entryId: string, questionId: string, value: string, wasShown = true) {
  await prisma.answer.create({ data: { entryId, questionId, value, wasShown } })
}

async function main() {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } })
  const primaryAdmin = admins[0]
  if (!primaryAdmin) {
    console.error('No admin user found. Run create-admin first.')
    process.exit(1)
  }

  await prisma.study.deleteMany({ where: { name: STUDY_NAME } })

  const study = await prisma.study.create({
    data: {
      name: STUDY_NAME,
      description: 'A journey-based diary study about support requests from the moment someone notices an issue until the outcome is clear.',
      consentText: 'You will be asked to document support requests before contacting support, during the interaction, and after the outcome. Do not include passwords, payment details, private customer data, or confidential screenshots.',
      contactEmail: primaryAdmin.email,
      mode: 'JOURNEY',
      journeyName: JOURNEY_NAME,
      isActive: true,
      sequential: false,
      remindersEnabled: false,
      participantEntryAccess: 'SHOW_READ_ONLY',
      reminderNote: 'Start a support request when you notice an issue, then continue with the next stage when you contact support and after the outcome is clear.',
    },
  })

  const beforePart = await prisma.part.create({
    data: {
      studyId: study.id,
      name: 'Before support',
      order: 1,
      instructions: 'Answer before you contact support or while deciding whether to ask for help.',
      flow: 'JOURNEY_STAGE',
      entryPolicy: 'MULTIPLE_PER_DAY',
      unlockRule: 'IMMEDIATE',
      isActive: true,
    },
  })

  const duringPart = await prisma.part.create({
    data: {
      studyId: study.id,
      name: 'During support',
      order: 2,
      instructions: 'Answer while you are interacting with support or immediately after the exchange.',
      flow: 'JOURNEY_STAGE',
      entryPolicy: 'MULTIPLE_PER_DAY',
      unlockRule: 'AFTER_PREVIOUS_TARGET',
      isActive: true,
    },
  })

  const afterPart = await prisma.part.create({
    data: {
      studyId: study.id,
      name: 'After the outcome',
      order: 3,
      instructions: 'Answer once you know whether the support request was resolved, escalated, or left open.',
      flow: 'JOURNEY_STAGE',
      entryPolicy: 'MULTIPLE_PER_DAY',
      unlockRule: 'AFTER_PREVIOUS_TARGET',
      isActive: true,
    },
  })

  await prisma.question.create({
    data: {
      studyId: study.id,
      partId: beforePart.id,
      page: 1,
      order: 0,
      text: 'Start here when a support need appears. The next stages keep the same support request together.',
      type: 'CONTENT',
      options: [],
      required: false,
    },
  })

  const issueStartedAt = await prisma.question.create({
    data: { studyId: study.id, partId: beforePart.id, page: 1, order: 1, text: 'When did you first notice the issue?', type: 'DATE_TIME', options: [], required: true },
  })
  const issueType = await prisma.question.create({
    data: { studyId: study.id, partId: beforePart.id, page: 1, order: 2, text: 'What type of issue is this?', type: 'SINGLE_CHOICE', options: [...ISSUE_TYPES, OTHER_SENTINEL], required: true },
  })
  const urgency = await prisma.question.create({
    data: { studyId: study.id, partId: beforePart.id, page: 1, order: 3, text: 'How urgent does this feel right now?', type: 'RATING', scaleType: 'numbers_labeled', options: ['Not urgent', 'Low', 'Somewhat low', 'Moderate', 'Somewhat high', 'High', 'Critical'], min: 1, max: 7, required: true },
  })
  const expectedHelp = await prisma.question.create({
    data: { studyId: study.id, partId: beforePart.id, page: 2, order: 4, text: 'What kind of help are you expecting?', type: 'FREE_TEXT', options: [], required: false },
  })

  const contactStartedAt = await prisma.question.create({
    data: { studyId: study.id, partId: duringPart.id, page: 1, order: 1, text: 'When did you contact support?', type: 'DATE_TIME', options: [], required: true },
  })
  const channel = await prisma.question.create({
    data: { studyId: study.id, partId: duringPart.id, page: 1, order: 2, text: 'Which channel did you use?', type: 'SINGLE_CHOICE', options: [...CHANNELS, OTHER_SENTINEL], required: true },
  })
  const infoProvided = await prisma.question.create({
    data: { studyId: study.id, partId: duringPart.id, page: 1, order: 3, text: 'What information did you need to provide?', type: 'MULTIPLE_CHOICE', options: [...PROVIDED_INFO, OTHER_SENTINEL], min: 1, max: 3, required: true },
  })
  const easeExplaining = await prisma.question.create({
    data: { studyId: study.id, partId: duringPart.id, page: 2, order: 4, text: 'How easy was it to explain the issue?', type: 'RATING', scaleType: 'numbers_labeled', options: ['Very hard', 'Hard', 'Somewhat hard', 'Neutral', 'Somewhat easy', 'Easy', 'Very easy'], min: 1, max: 7, required: true },
  })
  const duringNote = await prisma.question.create({
    data: { studyId: study.id, partId: duringPart.id, page: 2, order: 5, text: 'What happened during the support interaction?', type: 'FREE_TEXT', options: [], required: false },
  })

  const outcome = await prisma.question.create({
    data: { studyId: study.id, partId: afterPart.id, page: 1, order: 1, text: 'What was the outcome?', type: 'SINGLE_CHOICE', options: OUTCOMES, required: true },
  })
  const resolved = await prisma.question.create({
    data: { studyId: study.id, partId: afterPart.id, page: 1, order: 2, text: 'Was the issue resolved?', type: 'YES_NO', options: [], required: true },
  })
  const satisfaction = await prisma.question.create({
    data: { studyId: study.id, partId: afterPart.id, page: 1, order: 3, text: 'How satisfied are you with the support experience?', type: 'RATING', scaleType: 'numbers_labeled', options: ['Very dissatisfied', 'Dissatisfied', 'Somewhat dissatisfied', 'Neutral', 'Somewhat satisfied', 'Satisfied', 'Very satisfied'], min: 1, max: 7, required: true },
  })
  const friction = await prisma.question.create({
    data: { studyId: study.id, partId: afterPart.id, page: 2, order: 4, text: 'What made this support request harder?', type: 'MULTIPLE_CHOICE', options: [...SUPPORT_FRICTIONS, OTHER_SENTINEL], min: 1, max: 2, required: true },
  })
  const reflection = await prisma.question.create({
    data: { studyId: study.id, partId: afterPart.id, page: 2, order: 5, text: 'Looking across the support request, what mattered most?', type: 'FREE_TEXT', options: [], required: true },
  })

  const tagWaiting = await prisma.questionTag.create({ data: { questionId: reflection.id, label: 'Waiting time', color: '#f97316' } })
  const tagClarity = await prisma.questionTag.create({ data: { questionId: reflection.id, label: 'Clarity', color: '#4f46e5' } })
  const tagRepetition = await prisma.questionTag.create({ data: { questionId: reflection.id, label: 'Repetition', color: '#e11d48' } })

  const password = await bcrypt.hash('participant123', 10)
  const mockParticipants = []
  for (const [name, email] of PARTICIPANTS) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, role: 'PARTICIPANT', timezone: 'Europe/Zurich' },
      create: { email, password, name, role: 'PARTICIPANT', timezone: 'Europe/Zurich' },
    })
    mockParticipants.push(user)
  }

  for (const user of [...admins, ...mockParticipants]) {
    await prisma.studyParticipant.upsert({
      where: { studyId_userId: { studyId: study.id, userId: user.id } },
      update: { consentedAt: new Date() },
      create: { studyId: study.id, userId: user.id, consentedAt: new Date() },
    })
  }

  let journeyCount = 0
  let entryCount = 0

  for (const [userIndex, user] of mockParticipants.entries()) {
    for (let requestIndex = 0; requestIndex < 2; requestIndex++) {
      const date = dateDaysAgo(userIndex + requestIndex)
      const startHour = numberBetween(9, 15)
      const shouldBeOpen = userIndex === 0 && requestIndex === 1
      const skipBefore = userIndex === 1 && requestIndex === 1
      const supportIssue = pick(ISSUE_TYPES)
      const reflectionText = pick(AFTER_NOTES)
      const journey = await prisma.journey.create({
        data: {
          studyId: study.id,
          userId: user.id,
          label: `${JOURNEY_NAME} #${requestIndex + 1}`,
          createdAt: submittedAt(date, startHour),
          completedAt: shouldBeOpen ? null : submittedAt(date, startHour + 5),
        },
      })
      journeyCount += 1

      if (!skipBefore) {
        const beforeEntry = await prisma.entry.create({
          data: { studyId: study.id, partId: beforePart.id, userId: user.id, journeyId: journey.id, date, timezone: 'Europe/Zurich', submittedAt: submittedAt(date, startHour) },
        })
        entryCount += 1
        await answer(beforeEntry.id, issueStartedAt.id, `${date}T${String(startHour).padStart(2, '0')}:00`)
        await answer(beforeEntry.id, issueType.id, supportIssue)
        await answer(beforeEntry.id, urgency.id, String(numberBetween(3, 7)))
        await answer(beforeEntry.id, expectedHelp.id, pick(BEFORE_NOTES))
      }

      if (shouldBeOpen) continue

      const duringEntry = await prisma.entry.create({
        data: { studyId: study.id, partId: duringPart.id, userId: user.id, journeyId: journey.id, date, timezone: 'Europe/Zurich', submittedAt: submittedAt(date, startHour + 1) },
      })
      entryCount += 1
      await answer(duringEntry.id, contactStartedAt.id, `${date}T${String(startHour + 1).padStart(2, '0')}:15`)
      await answer(duringEntry.id, channel.id, pick(CHANNELS))
      await answer(duringEntry.id, infoProvided.id, JSON.stringify(sample(PROVIDED_INFO, 1, 3)))
      await answer(duringEntry.id, easeExplaining.id, String(numberBetween(3, 7)))
      await answer(duringEntry.id, duringNote.id, pick(DURING_NOTES))

      const afterEntry = await prisma.entry.create({
        data: { studyId: study.id, partId: afterPart.id, userId: user.id, journeyId: journey.id, date, timezone: 'Europe/Zurich', submittedAt: submittedAt(date, startHour + 4) },
      })
      entryCount += 1
      await answer(afterEntry.id, outcome.id, pick(OUTCOMES))
      await answer(afterEntry.id, resolved.id, Math.random() > 0.25 ? 'Yes' : 'No')
      await answer(afterEntry.id, satisfaction.id, String(numberBetween(4, 7)))
      await answer(afterEntry.id, friction.id, JSON.stringify(sample(SUPPORT_FRICTIONS, 1, 2)))
      const reflectionAnswer = await prisma.answer.create({ data: { entryId: afterEntry.id, questionId: reflection.id, value: reflectionText, wasShown: true } })
      const tags = [
        reflectionText.includes('time') || reflectionText.includes('wait') ? tagWaiting : null,
        reflectionText.includes('clear') || reflectionText.includes('concrete') || reflectionText.includes('explanation') ? tagClarity : null,
        reflectionText.includes('twice') || reflectionText.includes('same information') ? tagRepetition : null,
      ].filter(Boolean) as typeof tagWaiting[]
      if (tags.length > 0) {
        await prisma.answerTag.createMany({
          data: tags.map((tag) => ({ answerId: reflectionAnswer.id, tagId: tag.id })),
          skipDuplicates: true,
        })
      }
    }
  }

  console.log(`✓ Created "${study.name}"`)
  console.log(`  Study id: ${study.id}`)
  console.log(`  Journey name: ${JOURNEY_NAME}`)
  console.log(`  Stages: Before support -> During support -> After the outcome`)
  console.log(`  Journey instances: ${journeyCount}`)
  console.log(`  Entries: ${entryCount}`)
  console.log(`  Admin accounts are enrolled with no mock support requests, so the participant view starts clean.`)
  console.log(`  Example participant login: marta.support@example.com / participant123`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
