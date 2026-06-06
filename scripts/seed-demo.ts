import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Find the first admin user
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (!admin) {
    console.error('No admin user found. Run `npm run create-admin` first.')
    process.exit(1)
  }

  // Clean up any existing demo study
  await prisma.study.deleteMany({ where: { name: 'Demo Study — All Question Types' } })

  const study = await prisma.study.create({
    data: {
      name: 'Demo Study — All Question Types',
      description: 'A showcase study with every question type and two sequential parts.',
      isActive: true,
      sequential: true,
    },
  })

  // ── Part 1 ──────────────────────────────────────────────
  const part1 = await prisma.part.create({
    data: {
      studyId: study.id,
      name: 'Daily experience',
      order: 1,
      instructions: 'Please answer each question based on your experience today. Be honest — there are no right or wrong answers.',
      targetEntries: 3,
      durationDays: 7,
      isActive: true,
    },
  })

  await prisma.question.createMany({
    data: [
      {
        partId: part1.id,
        studyId: study.id,
        page: 1,
        order: 0,
        text: 'How did you feel today overall?',
        type: 'RATING',
        scaleType: 'numbers_labeled',
        options: ['Very bad', 'Bad', 'Somewhat bad', 'Neutral', 'Somewhat good', 'Good', 'Very good'],
        required: true,
        min: 1,
        max: 7,
      },
      {
        partId: part1.id,
        studyId: study.id,
        page: 1,
        order: 1,
        text: 'How stressed did you feel today?',
        type: 'RATING',
        scaleType: 'vas',
        options: ['Not at all stressed', 'Extremely stressed'],
        required: true,
        min: 0,
        max: 100,
      },
      {
        partId: part1.id,
        studyId: study.id,
        page: 1,
        order: 2,
        text: 'When did this experience happen?',
        type: 'DATE_TIME',
        options: [],
        required: false,
      },
      {
        partId: part1.id,
        studyId: study.id,
        page: 1,
        order: 3,
        text: 'Did you exercise today?',
        type: 'YES_NO',
        options: [],
        required: true,
      },
      {
        partId: part1.id,
        studyId: study.id,
        page: 2,
        order: 4,
        text: 'What was the main activity that took most of your time today?',
        type: 'MULTIPLE_CHOICE',
        options: ['Work / study', 'Family / social', 'Personal errands', 'Rest / leisure', '__OTHER__'],
        required: true,
      },
      {
        partId: part1.id,
        studyId: study.id,
        page: 2,
        order: 5,
        text: 'In your own words, describe the <strong>best moment</strong> of your day.',
        type: 'FREE_TEXT',
        options: [],
        required: true,
      },
      {
        partId: part1.id,
        studyId: study.id,
        page: 2,
        order: 6,
        text: 'Is there anything you would do differently today?',
        type: 'FREE_TEXT',
        options: [],
        required: false,
      },
      {
        partId: part1.id,
        studyId: study.id,
        page: 3,
        order: 7,
        text: 'Share a screenshot of something that caught your attention today (an app, a photo, anything).',
        type: 'SCREENSHOT',
        options: [],
        required: false,
      },
    ],
  })

  // ── Part 2 ──────────────────────────────────────────────
  const part2 = await prisma.part.create({
    data: {
      studyId: study.id,
      name: 'Weekly reflection',
      order: 2,
      instructions: 'This part unlocks after you complete Part 1. Take a moment to reflect on your week as a whole.',
      targetEntries: 1,
      isActive: true,
    },
  })

  await prisma.question.createMany({
    data: [
      {
        partId: part2.id,
        studyId: study.id,
        page: 1,
        order: 0,
        text: 'How would you rate this week overall?',
        type: 'RATING',
        scaleType: 'labels_only',
        options: ['Terrible', 'Poor', 'OK', 'Good', 'Great'],
        required: true,
        min: 1,
        max: 5,
      },
      {
        partId: part2.id,
        studyId: study.id,
        page: 1,
        order: 1,
        text: 'What was the <em>highlight</em> of your week?',
        type: 'FREE_TEXT',
        options: [],
        required: true,
      },
      {
        partId: part2.id,
        studyId: study.id,
        page: 1,
        order: 2,
        text: 'Which area of your life felt most challenging this week?',
        type: 'MULTIPLE_CHOICE',
        options: ['Work', 'Relationships', 'Health', 'Finances', 'Personal growth', '__OTHER__'],
        required: true,
      },
      {
        partId: part2.id,
        studyId: study.id,
        page: 1,
        order: 3,
        text: 'Would you say this was a productive week?',
        type: 'YES_NO',
        options: [],
        required: true,
      },
    ],
  })

  // Add admin as participant so they can test the participant view
  await prisma.studyParticipant.upsert({
    where: { studyId_userId: { studyId: study.id, userId: admin.id } },
    create: { studyId: study.id, userId: admin.id },
    update: {},
  })

  console.log(`✓ Demo study created: "${study.name}" (id: ${study.id})`)
  console.log(`  Part 1: "${part1.name}" — 3 pages, 8 questions, target 3 entries`)
  console.log(`  Part 2: "${part2.name}" — 1 page, 4 questions, target 1 entry`)
  console.log(`  Sequential: yes (Part 2 unlocks after Part 1 is complete)`)
  console.log(`  Admin enrolled as participant — log in to test the participant view`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
