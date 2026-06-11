import 'dotenv/config'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { SignJWT } from 'jose'

const QA_PARTICIPANT_EMAIL = process.env.QA_PARTICIPANT_EMAIL || 'qa.participant@diari.test'
const QA_PARTICIPANT_PASSWORD = process.env.QA_PARTICIPANT_PASSWORD || 'qa-participant-123'
const SIMPLE_STUDY_NAME = 'QA Smoke — Simple Diary'
const JOURNEY_STUDY_NAME = 'QA Smoke — Journey Study'
const baseURL =
  process.env.QA_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  'http://localhost:3000'

const prisma = process.env.DATABASE_URL
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  : null
const cleanupEmails: string[] = []

test.afterAll(async () => {
  if (prisma && cleanupEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: cleanupEmails } } })
  }
  await prisma?.$disconnect()
})

async function requirePrisma() {
  if (!prisma) test.skip(true, 'DATABASE_URL is required for QA fixture lookup.')
  return prisma!
}

async function loginParticipant(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(QA_PARTICIPANT_EMAIL)
  await page.getByLabel('Password').fill(QA_PARTICIPANT_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByText('Researcher view')).toHaveCount(0)
}

async function sessionToken(user: { id: string; role: 'ADMIN' | 'PARTICIPANT'; name: string; email: string }) {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is required for browser QA.')
  return new SignJWT({
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(new TextEncoder().encode(secret))
}

async function loginAdminByCookie(page: Page) {
  const db = await requirePrisma()
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } })
  expect(admin, 'No admin user found. Create an admin before browser QA.').toBeTruthy()
  const token = await sessionToken({
    id: admin!.id,
    role: admin!.role,
    name: admin!.name,
    email: admin!.email,
  })
  await page.context().addCookies([{
    name: 'session',
    value: token,
    url: baseURL,
    httpOnly: true,
    sameSite: 'Lax',
    secure: baseURL.startsWith('https://'),
  }])
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement
    const body = document.body
    return Math.max(root.scrollWidth, body.scrollWidth) - root.clientWidth
  })
  expect(overflow, `${label} should not create horizontal page overflow`).toBeLessThanOrEqual(2)
}

async function loadSimpleStudy() {
  const db = await requirePrisma()
  const study = await db.study.findFirst({
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
  expect(study?.inviteToken, 'Simple QA study needs an invite token.').toBeTruthy()
  expect(study?.parts[0], 'Simple QA study needs one standard part.').toBeTruthy()
  expect(study?.parts[0]?.questions[0], 'Simple QA part needs one question.').toBeTruthy()
  return study!
}

async function loadJourneyStudy() {
  const db = await requirePrisma()
  const participant = await db.user.findUnique({ where: { email: QA_PARTICIPANT_EMAIL } })
  expect(participant, 'Run npm run qa:seed before browser QA.').toBeTruthy()

  const study = await db.study.findFirst({
    where: { name: JOURNEY_STUDY_NAME },
    include: {
      parts: {
        where: { flow: 'JOURNEY_STAGE' },
        orderBy: { order: 'asc' },
        include: { questions: { where: { type: { not: 'CONTENT' } }, orderBy: { order: 'asc' } } },
      },
      journeys: {
        where: { userId: participant!.id, completedAt: null },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  expect(study, 'Run npm run qa:seed before browser QA.').toBeTruthy()
  expect(study?.parts.length, 'Journey QA study needs three stages.').toBeGreaterThanOrEqual(3)
  expect(study?.journeys[0], 'Journey QA study needs one open journey.').toBeTruthy()
  return { study: study!, journey: study!.journeys[0] }
}

async function loadQaParticipant() {
  const db = await requirePrisma()
  const participant = await db.user.findUnique({ where: { email: QA_PARTICIPANT_EMAIL } })
  expect(participant, 'Run npm run qa:seed before browser QA.').toBeTruthy()
  return participant!
}

async function ensureSimpleAnalysisEntry() {
  const db = await requirePrisma()
  const participant = await loadQaParticipant()
  const study = await loadSimpleStudy()
  const part = study.parts[0]
  const question = part.questions[0]

  return db.entry.create({
    data: {
      studyId: study.id,
      partId: part.id,
      userId: participant.id,
      date: '2026-06-10',
      timezone: 'Europe/Zurich',
      qualityFlags: ['SHORT_TEXT'],
      answers: {
        create: [{
          questionId: question.id,
          value: 'Browser QA dataset answer',
        }],
      },
    },
  })
}

async function ensureJourneyContinuityEntries() {
  const db = await requirePrisma()
  const participant = await loadQaParticipant()
  const { study, journey } = await loadJourneyStudy()

  for (const part of study.parts.slice(0, 2)) {
    const existing = await db.entry.findFirst({ where: { journeyId: journey.id, partId: part.id } })
    if (existing) continue

    try {
      await db.entry.create({
        data: {
          studyId: study.id,
          partId: part.id,
          userId: participant.id,
          journeyId: journey.id,
          date: '2026-06-10',
          timezone: 'Europe/Zurich',
          answers: {
            create: [{
              questionId: part.questions[0].id,
              value: `Browser QA answer for ${part.name}`,
            }],
          },
        },
      })
    } catch {
      // The desktop and mobile projects can touch the same QA fixture. If the
      // other project created this unique journey stage first, the fixture is ready.
      const createdByOtherProject = await db.entry.findFirst({ where: { journeyId: journey.id, partId: part.id } })
      if (!createdByOtherProject) throw new Error(`Could not create QA journey entry for ${part.name}.`)
    }
  }

  return { study, journey }
}

test('invite link lets a new participant create an account and join', async ({ page }, testInfo) => {
  const db = await requirePrisma()
  const study = await loadSimpleStudy()
  const projectSlug = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const email = `qa.invite.${projectSlug}.${testInfo.workerIndex}.${Date.now()}@diari.test`
  await db.user.deleteMany({ where: { email } })
  cleanupEmails.push(email)

  await page.goto(`/join/${study.inviteToken}`)
  await expect(page.getByText('Study invite')).toBeVisible()
  await expect(page.getByRole('heading', { name: SIMPLE_STUDY_NAME })).toBeVisible()
  await page.getByRole('link', { name: 'Create participant account' }).click()

  await expect(page).toHaveURL(/\/signup/)
  await page.getByLabel('Full name').fill('QA Invite Participant')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill('qa-invite-123')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.locator('h2', { hasText: SIMPLE_STUDY_NAME })).toBeVisible()
  await expect(page.getByText('Researcher view')).toHaveCount(0)

  const participant = await db.user.findUnique({
    where: { email },
    include: { participations: { where: { studyId: study.id } } },
  })
  expect(participant?.participations).toHaveLength(1)
})

test('profile keeps a participant on the participant side when going back', async ({ page }) => {
  await loginParticipant(page)

  await page.locator('a[href^="/profile"]').first().click()
  await expect(page).toHaveURL(/\/profile/)
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByText('Researcher view')).toHaveCount(0)
})

test('participant dashboard stays readable without horizontal overflow', async ({ page }) => {
  await loginParticipant(page)
  await expect(page.locator('h2', { hasText: SIMPLE_STUDY_NAME })).toBeVisible()
  await expect(page.locator('h2', { hasText: JOURNEY_STUDY_NAME })).toBeVisible()
  await expectNoHorizontalOverflow(page, 'Participant dashboard')
})

test('simple reminder destination opens the entry form and saves an answer', async ({ page }) => {
  const study = await loadSimpleStudy()
  const part = study.parts[0]
  const question = part.questions[0]
  const answer = `Browser QA answer ${Date.now()}`

  await loginParticipant(page)

  await page.goto(`/entry/new?studyId=${study.id}&partId=${part.id}`)
  await expect(page.getByText(question.text)).toBeVisible()
  await expectNoHorizontalOverflow(page, 'Simple entry form')
  await page.locator(`textarea[name="question_${question.id}"]`).fill(answer)
  await page.getByRole('button', { name: 'Submit entry' }).click()

  await expect(page.getByText('Entry submitted')).toBeVisible()
  await expect(page.getByText(answer)).toBeVisible()
})

test('journey reminder destination opens the dashboard with stage choices', async ({ page }) => {
  const { study, journey } = await loadJourneyStudy()
  const firstStage = study.parts[0]
  const secondStage = study.parts[1]

  await loginParticipant(page)
  await page.goto('/dashboard')

  await expect(page.locator('h2', { hasText: JOURNEY_STUDY_NAME })).toBeVisible()
  await expect(page.getByText(firstStage.name, { exact: true })).toBeVisible()
  await expect(page.getByText(secondStage.name, { exact: true })).toBeVisible()
  await expect(page.getByText('Recommended next')).toBeVisible()
  await expectNoHorizontalOverflow(page, 'Journey dashboard')

  const secondStageLink = page.locator(
    `a[href="/entry/new?studyId=${study.id}&partId=${secondStage.id}&journeyId=${journey.id}"]`
  )
  await expect(secondStageLink).toBeVisible()
  await secondStageLink.click()

  await expect(page).toHaveURL(new RegExp(`/entry/new\\?studyId=${study.id}&partId=${secondStage.id}&journeyId=${journey.id}`))
  await expect(page.getByText(secondStage.questions[0].text)).toBeVisible()
  await expectNoHorizontalOverflow(page, 'Journey entry form')
})

test('researcher setup page stays readable without horizontal overflow', async ({ page }) => {
  const study = await loadSimpleStudy()
  await loginAdminByCookie(page)

  await page.goto(`/admin/studies/${study.id}/edit`)
  await expect(page.getByRole('heading', { name: SIMPLE_STUDY_NAME })).toBeVisible()
  await expect(page.getByLabel('Study name *')).toBeVisible()
  await expectNoHorizontalOverflow(page, 'Researcher setup page')
})

test('researcher setup save state follows edits', async ({ page }) => {
  const study = await loadSimpleStudy()
  await loginAdminByCookie(page)

  await page.goto(`/admin/studies/${study.id}/edit`)
  await expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled()

  await page.getByLabel('Description').fill(`${study.description} Browser QA edit`)
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  await expectNoHorizontalOverflow(page, 'Researcher setup dirty state')
})

test('researcher data table exposes safe export controls', async ({ page }) => {
  const study = await loadSimpleStudy()
  await ensureSimpleAnalysisEntry()
  await loginAdminByCookie(page)

  await page.goto(`/admin/studies/${study.id}/data`)
  await expect(page.getByText('Export columns', { exact: true })).toBeVisible()
  await expect(page.getByText(/columns selected for CSV export/i)).toBeVisible()
  await expect(page.getByLabel('Anonymize download')).toBeChecked()
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeEnabled()

  const emailColumn = page.getByLabel('Include email in download')
  if ((await emailColumn.count()) > 0 && await emailColumn.first().isVisible()) {
    await expect(emailColumn.first()).toBeDisabled()
  }

  await page.getByRole('button', { name: 'Deselect all' }).click()
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeDisabled()
  await expectNoHorizontalOverflow(page, 'Researcher data table')
})

test('researcher analysis shows quality and journey continuity summaries', async ({ page }) => {
  await ensureSimpleAnalysisEntry()
  const { study } = await ensureJourneyContinuityEntries()
  await loginAdminByCookie(page)

  await page.goto(`/admin/studies/${study.id}/analysis`)
  await expect(page.getByText('Entries analyzed')).toBeVisible()
  await expect(page.getByText('Answer completion')).toBeVisible()
  await expect(page.getByText('Missing answers')).toBeVisible()
  await expect(page.getByText('Journey continuity')).toBeVisible()
  await expect(page.getByText('Stage coverage')).toBeVisible()
  await expect(page.getByText('Recent journeys')).toBeVisible()
  await expectNoHorizontalOverflow(page, 'Researcher analysis dashboard')
})
