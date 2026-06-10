import 'dotenv/config'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const QA_PARTICIPANT_EMAIL = process.env.QA_PARTICIPANT_EMAIL || 'qa.participant@diari.test'
const QA_PARTICIPANT_PASSWORD = process.env.QA_PARTICIPANT_PASSWORD || 'qa-participant-123'
const SIMPLE_STUDY_NAME = 'QA Smoke — Simple Diary'

const prisma = process.env.DATABASE_URL
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  : null

test.afterAll(async () => {
  await prisma?.$disconnect()
})

test('participant can sign in and submit a simple diary entry', async ({ page }) => {
  if (!prisma) {
    test.skip(true, 'DATABASE_URL is required for QA fixture lookup.')
    return
  }

  const participant = await prisma.user.findUnique({ where: { email: QA_PARTICIPANT_EMAIL } })
  expect(participant, 'Run npm run qa:seed before browser QA.').toBeTruthy()

  const study = await prisma.study.findFirst({
    where: { name: SIMPLE_STUDY_NAME },
    include: {
      parts: {
        where: { flow: { not: 'JOURNEY_STAGE' } },
        orderBy: { order: 'asc' },
        include: { questions: { where: { type: { not: 'CONTENT' } }, orderBy: { order: 'asc' } } },
      },
    },
  })
  expect(study, 'Run npm run qa:seed before browser QA.').toBeTruthy()
  const part = study?.parts[0]
  const question = part?.questions[0]
  expect(part).toBeTruthy()
  expect(question).toBeTruthy()

  const answer = `Browser QA answer ${Date.now()}`

  await page.goto('/login')
  await page.getByLabel('Email address').fill(QA_PARTICIPANT_EMAIL)
  await page.getByLabel('Password').fill(QA_PARTICIPANT_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByText(SIMPLE_STUDY_NAME)).toBeVisible()
  await expect(page.getByText('Researcher view')).toHaveCount(0)

  await page.goto(`/entry/new?studyId=${study!.id}&partId=${part!.id}`)
  await expect(page.getByText(question!.text)).toBeVisible()
  await page.locator(`textarea[name="question_${question!.id}"]`).fill(answer)
  await page.getByRole('button', { name: 'Submit entry' }).click()

  await expect(page.getByText('Entry submitted')).toBeVisible()
  await expect(page.getByText(answer)).toBeVisible()
})
