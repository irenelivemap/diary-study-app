import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const STUDY_NAME = 'Demo Study — Commute & Mobility Moments'
const OTHER_SENTINEL = '__OTHER__'

const PARTICIPANTS = [
  ['Ava Keller', 'ava.keller@example.com'],
  ['Mateo Rossi', 'mateo.rossi@example.com'],
  ['Lea Novak', 'lea.novak@example.com'],
  ['Jonas Weber', 'jonas.weber@example.com'],
  ['Nina Patel', 'nina.patel@example.com'],
  ['Samira Haddad', 'samira.haddad@example.com'],
  ['Theo Martin', 'theo.martin@example.com'],
  ['Clara Stein', 'clara.stein@example.com'],
] as const

const MODES = ['Train', 'Bus / tram', 'Car', 'Bike', 'Walking', 'Ride share']
const TOUCHPOINTS = ['Waiting time', 'Crowding', 'Navigation', 'Cost', 'Safety', 'Weather', 'Accessibility']
const DELAY_CAUSES = ['Transit delay', 'Traffic', 'Parking', 'Weather', 'Personal timing']
const IMPROVEMENTS = ['Clearer information', 'Lower cost', 'Shorter waiting', 'Better comfort', 'Safer routes', 'More flexibility']

const MOMENTS = [
  'The transfer was confusing because the platform changed at the last minute.',
  'The route felt smooth today because I could sit and had clear arrival information.',
  'I had to wait longer than expected and did not know whether I should switch route.',
  'Cycling was pleasant, but one intersection felt unsafe during rush hour.',
  'The app showed a faster route, but it required too many changes to feel worth it.',
  'I chose to walk for the last part because the tram was too crowded.',
  'The parking search added stress and made the trip feel longer than it was.',
  'A delay notification came early enough, so I could adjust without much stress.',
]

const WEEKLY_REFLECTIONS = [
  'I became more aware of how much uncertainty affects my commute, especially when changing between modes.',
  'Comfort mattered more than speed this week. I avoided the fastest option twice because it felt too crowded.',
  'Small delays were not the main issue; not knowing what was happening was more frustrating.',
  'I noticed that I often pick routes based on predictability, not just travel time.',
]

function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

function sample<T>(items: T[], min: number, max: number) {
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

function dateTimeOn(date: string, minHour = 7, maxHour = 20) {
  return `${date}T${String(numberBetween(minHour, maxHour)).padStart(2, '0')}:${String(numberBetween(0, 59)).padStart(2, '0')}`
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (!admin) {
    console.error('No admin user found. Run create-admin first.')
    process.exit(1)
  }

  await prisma.study.deleteMany({ where: { name: STUDY_NAME } })

  const study = await prisma.study.create({
    data: {
      name: STUDY_NAME,
      description: 'An event-based diary study about commute moments, mobility choices, and friction points.',
      consentText: 'You will be asked to log recent commute or mobility moments and reflect on what made them easier or harder. Please avoid sharing personal addresses or sensitive information.',
      contactEmail: admin.email,
      reminderNote: 'Log a commute moment when something noticeable happens during your trip.',
      isActive: true,
      sequential: false,
      remindersEnabled: false,
    },
  })

  const momentsPart = await prisma.part.create({
    data: {
      studyId: study.id,
      name: 'Trip moments',
      order: 1,
      instructions: 'Log a commute or mobility moment soon after it happens. Focus on concrete situations, not general opinions.',
      entryPolicy: 'MULTIPLE_PER_DAY',
      targetEntries: 5,
      durationDays: 14,
      unlockRule: 'IMMEDIATE',
      isActive: true,
    },
  })

  const wrapPart = await prisma.part.create({
    data: {
      studyId: study.id,
      name: 'Mobility reflection',
      order: 2,
      instructions: 'After several trip moments, reflect on patterns across your week.',
      targetEntries: 1,
      durationDays: 14,
      unlockRule: 'IMMEDIATE',
      isActive: true,
    },
  })

  await prisma.question.create({
    data: {
      studyId: study.id,
      partId: momentsPart.id,
      page: 1,
      order: 0,
      text: 'Think about one specific trip or mobility moment. Answer based on what happened in that situation.',
      type: 'CONTENT',
      options: [],
      required: false,
    },
  })

  const tripTime = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: momentsPart.id,
      page: 1,
      order: 1,
      text: 'When did this trip or mobility moment happen?',
      type: 'DATE_TIME',
      options: [],
      required: true,
    },
  })

  const mode = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: momentsPart.id,
      page: 1,
      order: 2,
      text: 'What was your main mode of transport?',
      type: 'SINGLE_CHOICE',
      options: [...MODES, OTHER_SENTINEL],
      required: true,
    },
  })

  const touchpoints = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: momentsPart.id,
      page: 1,
      order: 3,
      text: 'Which parts of the trip most affected your experience?',
      type: 'MULTIPLE_CHOICE',
      options: [...TOUCHPOINTS, OTHER_SENTINEL],
      required: true,
      min: 1,
      max: 3,
    },
  })

  const ease = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: momentsPart.id,
      page: 2,
      order: 4,
      text: 'How easy was this trip overall?',
      type: 'RATING',
      scaleType: 'numbers_labeled',
      options: ['Very difficult', 'Difficult', 'Somewhat difficult', 'Neutral', 'Somewhat easy', 'Easy', 'Very easy'],
      required: true,
      min: 1,
      max: 7,
    },
  })

  const stress = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: momentsPart.id,
      page: 2,
      order: 5,
      text: 'How stressful did the moment feel?',
      type: 'RATING',
      scaleType: 'vas',
      options: ['Not stressful', 'Extremely stressful'],
      required: true,
      min: 0,
      max: 100,
    },
  })

  const delayed = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: momentsPart.id,
      page: 2,
      order: 6,
      text: 'Were you delayed or slowed down?',
      type: 'YES_NO',
      options: [],
      required: true,
    },
  })

  const delayCause = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: momentsPart.id,
      page: 2,
      order: 7,
      text: 'What was the main reason for the delay?',
      type: 'SINGLE_CHOICE',
      options: [...DELAY_CAUSES, OTHER_SENTINEL],
      required: true,
      showIfQuestionId: delayed.id,
      showIfValue: 'Yes',
    },
  })

  const story = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: momentsPart.id,
      page: 3,
      order: 8,
      text: 'What happened? Describe the moment in your own words.',
      type: 'FREE_TEXT',
      options: [],
      required: true,
    },
  })

  const screenshot = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: momentsPart.id,
      page: 3,
      order: 9,
      text: 'Optional: upload a screenshot, photo, or route detail that helps explain the moment.',
      type: 'SCREENSHOT',
      options: [],
      required: false,
    },
  })

  const weekRating = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: wrapPart.id,
      page: 1,
      order: 0,
      text: 'Overall, how well did mobility work for you this week?',
      type: 'RATING',
      scaleType: 'labels_only',
      options: ['Very poorly', 'Poorly', 'Okay', 'Well', 'Very well'],
      required: true,
      min: 1,
      max: 5,
    },
  })

  const improvements = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: wrapPart.id,
      page: 1,
      order: 1,
      text: 'Which improvements would have helped most this week?',
      type: 'MULTIPLE_CHOICE',
      options: [...IMPROVEMENTS, OTHER_SENTINEL],
      required: true,
      min: 1,
      max: 2,
    },
  })

  const reflection = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: wrapPart.id,
      page: 1,
      order: 2,
      text: 'What pattern did you notice across your mobility moments?',
      type: 'FREE_TEXT',
      options: [],
      required: true,
    },
  })

  const changedBehavior = await prisma.question.create({
    data: {
      studyId: study.id,
      partId: wrapPart.id,
      page: 1,
      order: 3,
      text: 'Did you change any travel behavior because of these moments?',
      type: 'YES_NO',
      options: [],
      required: true,
    },
  })

  const tagComfort = await prisma.questionTag.create({ data: { questionId: story.id, label: 'Comfort', color: '#14b8a6' } })
  const tagInformation = await prisma.questionTag.create({ data: { questionId: story.id, label: 'Information', color: '#6366f1' } })
  const tagSafety = await prisma.questionTag.create({ data: { questionId: story.id, label: 'Safety', color: '#f97316' } })
  const tagDelay = await prisma.questionTag.create({ data: { questionId: story.id, label: 'Delay', color: '#ef4444' } })

  const password = await bcrypt.hash('participant123', 10)
  const users = []
  for (const [name, email] of PARTICIPANTS) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, role: 'PARTICIPANT' },
      create: { email, password, name, role: 'PARTICIPANT' },
    })
    users.push(user)
    await prisma.studyParticipant.upsert({
      where: { studyId_userId: { studyId: study.id, userId: user.id } },
      update: {},
      create: { studyId: study.id, userId: user.id, consentedAt: new Date() },
    })
  }

  await prisma.studyParticipant.upsert({
    where: { studyId_userId: { studyId: study.id, userId: admin.id } },
    update: {},
    create: { studyId: study.id, userId: admin.id, consentedAt: new Date() },
  })

  let entryCount = 0
  for (const [userIndex, user] of users.entries()) {
    for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
      if (userIndex > 5 && dayOffset > 2) continue
      const date = dateDaysAgo(dayOffset)
      const isDelayed = Math.random() > 0.45
      const easeScore = isDelayed ? numberBetween(1, 4) : numberBetween(4, 7)
      const stressScore = isDelayed ? numberBetween(45, 95) : numberBetween(5, 55)
      const storyText = pick(MOMENTS)
      const storyTags = [
        storyText.includes('delay') || storyText.includes('wait') ? tagDelay : null,
        storyText.includes('information') || storyText.includes('notification') || storyText.includes('platform') ? tagInformation : null,
        storyText.includes('unsafe') || storyText.includes('crowded') ? tagSafety : null,
        storyText.includes('sit') || storyText.includes('crowded') || storyText.includes('smooth') ? tagComfort : null,
      ].filter(Boolean) as typeof tagComfort[]

      const entry = await prisma.entry.create({
        data: {
          studyId: study.id,
          partId: momentsPart.id,
          userId: user.id,
          date,
          timezone: 'Europe/Zurich',
          submittedAt: new Date(`${date}T${String(numberBetween(8, 22)).padStart(2, '0')}:${String(numberBetween(0, 59)).padStart(2, '0')}:00`),
        },
      })
      entryCount += 1

      const storyAnswer = await prisma.answer.create({
        data: { entryId: entry.id, questionId: story.id, value: storyText },
      })

      await prisma.answer.createMany({
        data: [
          { entryId: entry.id, questionId: tripTime.id, value: dateTimeOn(date) },
          { entryId: entry.id, questionId: mode.id, value: pick(MODES) },
          { entryId: entry.id, questionId: touchpoints.id, value: JSON.stringify(sample(TOUCHPOINTS, 1, 3)) },
          { entryId: entry.id, questionId: ease.id, value: String(easeScore) },
          { entryId: entry.id, questionId: stress.id, value: String(stressScore) },
          { entryId: entry.id, questionId: delayed.id, value: isDelayed ? 'Yes' : 'No' },
          { entryId: entry.id, questionId: delayCause.id, value: isDelayed ? pick(DELAY_CAUSES) : 'N/A - not shown', wasShown: isDelayed },
          { entryId: entry.id, questionId: screenshot.id, value: '' },
        ],
      })

      if (storyTags.length > 0) {
        await prisma.answerTag.createMany({
          data: storyTags.map((tag) => ({ answerId: storyAnswer.id, tagId: tag.id })),
          skipDuplicates: true,
        })
      }
    }
  }

  for (const user of users.slice(0, 5)) {
    const date = dateDaysAgo(0)
    const entry = await prisma.entry.create({
      data: {
        studyId: study.id,
        partId: wrapPart.id,
        userId: user.id,
        date,
        timezone: 'Europe/Zurich',
        submittedAt: new Date(),
      },
    })
    entryCount += 1

    await prisma.answer.createMany({
      data: [
        { entryId: entry.id, questionId: weekRating.id, value: String(numberBetween(2, 5)) },
        { entryId: entry.id, questionId: improvements.id, value: JSON.stringify(sample(IMPROVEMENTS, 1, 2)) },
        { entryId: entry.id, questionId: reflection.id, value: pick(WEEKLY_REFLECTIONS) },
        { entryId: entry.id, questionId: changedBehavior.id, value: Math.random() > 0.5 ? 'Yes' : 'No' },
      ],
    })
  }

  console.log(`✓ Created "${study.name}"`)
  console.log(`  Study id: ${study.id}`)
  console.log(`  Participants: ${users.length} mock participants + admin`)
  console.log(`  Entries: ${entryCount}`)
  console.log('  Example participant login: ava.keller@example.com / participant123')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
