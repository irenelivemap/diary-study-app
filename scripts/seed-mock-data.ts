import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PARTICIPANT_NAMES = [
  'Sophie Müller', 'Luca Bianchi', 'Emma Johansson', 'Noah Garcia',
  'Mia Andersen', 'Oliver Chen',
]

const MOODS = ['Very bad', 'Bad', 'Neutral', 'Good', 'Very good']
const ACTIVITIES = ['Work / study', 'Family / social', 'Personal errands', 'Rest / leisure']
const BEST_MOMENTS = [
  'Had a great coffee in the morning and felt ready for the day.',
  'Finished a difficult task at work that had been pending for weeks.',
  'A walk in the park during lunch — really cleared my head.',
  'A long phone call with an old friend, felt really connected.',
  'Cooked a new recipe and it turned out great.',
  'Managed to exercise for the first time this week.',
  'Got positive feedback on a project I had been working on.',
  'Found time to read a book in the evening, very relaxing.',
  'Had a spontaneous dinner out with my partner.',
  'Helped a colleague solve a tricky problem.',
]
const WORST_MOMENTS = [
  'Traffic was terrible on the way home.',
  'Meeting ran too long and I lost focus.',
  'Didn\'t sleep well last night, felt tired all day.',
  'An unexpected email caused some stress in the afternoon.',
  'Missed my exercise routine again.',
  null, null, null, // some empty
]
const WEEKLY_HIGHLIGHTS = [
  'Finally finished the project I had been working on for a month.',
  'Spent quality time with family over the weekend.',
  'Made progress on a personal goal I had set at the start of the year.',
  'Had a great team lunch on Friday.',
  'Discovered a new hobby I really enjoy.',
  'Managed to keep a healthy routine all week.',
]
const CHALLENGES = ['Work', 'Relationships', 'Health', 'Finances', 'Personal growth']

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickNum(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pastDate(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split('T')[0]
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (!admin) { console.error('No admin found. Run create-admin first.'); process.exit(1) }

  const demoStudy = await prisma.study.findFirst({
    where: { name: 'Demo Study — All Question Types' },
    include: {
      parts: { include: { questions: true } }
    }
  })
  if (!demoStudy) { console.error('Demo study not found. Run seed-demo first.'); process.exit(1) }

  const part1 = demoStudy.parts.find(p => p.order === 1)!
  const part2 = demoStudy.parts.find(p => p.order === 2)!

  // Create participant users
  const password = await bcrypt.hash('participant123', 10)
  const participantUsers = []

  for (const name of PARTICIPANT_NAMES) {
    const email = `${name.toLowerCase().replace(/\s/g, '.').replace(/[^a-z.]/g, '')}@example.com`
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, password, name, role: 'PARTICIPANT' },
    })
    participantUsers.push(user)

    // Enroll in study
    await prisma.studyParticipant.upsert({
      where: { studyId_userId: { studyId: demoStudy.id, userId: user.id } },
      create: { studyId: demoStudy.id, userId: user.id },
      update: {},
    })
  }

  // Helper: find question by type/order in a part
  const q = (part: typeof part1, type: string, idx = 0) =>
    part.questions.filter(q => q.type === type)[idx]

  // Create Part 1 entries — 3 entries per participant over past 3 days
  for (const user of participantUsers) {
    for (let day = 0; day < 3; day++) {
      const date = pastDate(day)

      // Check if entry already exists
      const existing = await prisma.entry.findUnique({
        where: { partId_userId_date: { partId: part1.id, userId: user.id, date } }
      })
      if (existing) continue

      const moodRating = pickNum(1, 7)
      const stressRating = pickNum(10, 90)
      const exercised = Math.random() > 0.4 ? 'Yes' : 'No'
      const eventTime = `${date}T${String(pickNum(7, 22)).padStart(2, '0')}:${String(pickNum(0, 59)).padStart(2, '0')}`
      const activity = pick(ACTIVITIES)
      const bestMoment = pick(BEST_MOMENTS)
      const wouldDoDiff = pick(WORST_MOMENTS)

      const entry = await prisma.entry.create({
        data: {
          studyId: demoStudy.id,
          partId: part1.id,
          userId: user.id,
          date,
          submittedAt: new Date(`${date}T${String(pickNum(8, 21)).padStart(2, '0')}:${String(pickNum(0, 59)).padStart(2, '0')}:00`),
        }
      })

      // Create answers for each question
      const answers: { entryId: string; questionId: string; value: string }[] = []

      for (const question of part1.questions) {
        let value = ''
        if (question.type === 'RATING' && question.scaleType === 'numbers_labeled') value = String(moodRating)
        else if (question.type === 'RATING' && question.scaleType === 'vas') value = String(stressRating)
        else if (question.type === 'DATE_TIME') value = eventTime
        else if (question.type === 'YES_NO') value = exercised
        else if (question.type === 'MULTIPLE_CHOICE') value = activity
        else if (question.type === 'FREE_TEXT' && question.order === 4) value = bestMoment
        else if (question.type === 'FREE_TEXT' && question.order === 5) value = wouldDoDiff ?? ''
        else if (question.type === 'SCREENSHOT') value = ''

        answers.push({ entryId: entry.id, questionId: question.id, value })
      }

      await prisma.answer.createMany({ data: answers })
    }
  }

  // Create Part 2 entries — only for first 3 participants (they "completed" part 1)
  for (const user of participantUsers.slice(0, 3)) {
    const date = pastDate(0) // today

    const existing = await prisma.entry.findUnique({
      where: { partId_userId_date: { partId: part2.id, userId: user.id, date } }
    })
    if (existing) continue

    const weekRating = pickNum(1, 5)
    const highlight = pick(WEEKLY_HIGHLIGHTS)
    const challenge = pick(CHALLENGES)
    const productive = Math.random() > 0.3 ? 'Yes' : 'No'

    const entry = await prisma.entry.create({
      data: {
        studyId: demoStudy.id,
        partId: part2.id,
        userId: user.id,
        date,
        submittedAt: new Date(),
      }
    })

    const answers: { entryId: string; questionId: string; value: string }[] = []
    for (const question of part2.questions) {
      let value = ''
      if (question.type === 'RATING') value = String(weekRating)
      else if (question.type === 'FREE_TEXT') value = highlight
      else if (question.type === 'MULTIPLE_CHOICE') value = challenge
      else if (question.type === 'YES_NO') value = productive
      answers.push({ entryId: entry.id, questionId: question.id, value })
    }

    await prisma.answer.createMany({ data: answers })
  }

  const totalEntries = 3 * participantUsers.length + 3
  console.log(`✓ Created ${participantUsers.length} participants`)
  console.log(`✓ Created ~${totalEntries} mock entries`)
  console.log(`  Part 1: 3 entries × ${participantUsers.length} participants`)
  console.log(`  Part 2: 1 entry × 3 participants`)
  console.log(`  Example participant login: luca.bianchi@example.com / participant123`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
