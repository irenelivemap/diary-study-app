/**
 * Playwright end-to-end tests covering participant and researcher workflows.
 */
import 'dotenv/config'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { SignJWT } from 'jose'
import bcrypt from 'bcryptjs'
import { passwordResetTokenHash } from '@/app/lib/password-reset'
import { resolveDatabaseUrl } from '@/app/lib/database-url'

const QA_PARTICIPANT_EMAIL = process.env.QA_PARTICIPANT_EMAIL || 'qa.participant@diari.test'
const SIMPLE_STUDY_NAME = 'QA Smoke — Simple Diary'
const JOURNEY_STUDY_NAME = 'QA Smoke — Journey Study'
const baseURL =
  process.env.QA_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  'http://localhost:3000'

function createPrismaClient() {
  return process.env.DATABASE_URL
    ? new PrismaClient({ adapter: new PrismaPg({ connectionString: resolveDatabaseUrl() }) })
    : null
}

let prisma = createPrismaClient()
const cleanupEmails: string[] = []
const cleanupInvitationEmails: string[] = []
const cleanupTagIds: string[] = []
const cleanupStudyIds: string[] = []

test.afterAll(async () => {
  if (prisma) {
    if (cleanupTagIds.length > 0) {
      await prisma.questionTag.deleteMany({ where: { id: { in: cleanupTagIds } } })
    }
    if (cleanupStudyIds.length > 0) {
      await prisma.study.deleteMany({ where: { id: { in: cleanupStudyIds } } })
    }
    if (cleanupInvitationEmails.length > 0) {
      await prisma.studyInvitation.deleteMany({ where: { email: { in: cleanupInvitationEmails } } })
    }
    if (cleanupEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: cleanupEmails } } })
    }
  }
  await prisma?.$disconnect()
})

async function requirePrisma() {
  if (!prisma) test.skip(true, 'DATABASE_URL is required for QA fixture lookup.')
  try {
    await prisma!.$queryRaw`SELECT 1`
  } catch {
    await prisma?.$disconnect().catch(() => {})
    prisma = createPrismaClient()
  }
  return prisma!
}

async function loginParticipant(page: Page) {
  const db = await requirePrisma()
  const participant = await db.user.findUnique({ where: { email: QA_PARTICIPANT_EMAIL } })
  expect(participant, 'Run npm run qa:seed before browser QA.').toBeTruthy()
  const token = await sessionToken({
    id: participant!.id,
    role: participant!.role,
    name: participant!.name,
    email: participant!.email,
  })
  await page.context().addCookies([{
    name: 'session',
    value: token,
    url: baseURL,
    httpOnly: true,
    sameSite: 'Lax',
    secure: baseURL.startsWith('https://'),
  }])
  await page.goto('/dashboard')
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
        include: {
          entries: {
            select: { partId: true },
          },
        },
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

async function createConditionalStudyFixture(testInfo: { project: { name: string }; workerIndex: number }, suffix: string) {
  const db = await requirePrisma()
  const projectSlug = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const now = Date.now()
  const email = `qa.condition.${suffix}.${projectSlug}.${testInfo.workerIndex}.${now}@diari.test`
  const user = await db.user.create({
    data: {
      email,
      name: `QA Condition ${suffix}`,
      password: await bcrypt.hash(`qa-condition-${now}`, 12),
      role: 'PARTICIPANT',
    },
  })
  cleanupEmails.push(email)

  const studyId = crypto.randomUUID()
  const partId = crypto.randomUUID()
  const sourceQuestionId = crypto.randomUUID()
  const shownWhenYesQuestionId = crypto.randomUUID()
  const shownWhenNotYesQuestionId = crypto.randomUUID()

  const study = await db.study.create({
    data: {
      id: studyId,
      name: `QA Conditional Logic ${suffix} ${now}`,
      description: 'Browser QA study for conditional questions.',
      status: 'ACTIVE',
      isActive: true,
      parts: {
        create: [{
          id: partId,
          name: 'Conditional questions',
          order: 0,
          entryPolicy: 'MULTIPLE_PER_DAY',
          questions: {
            create: [
              {
                id: sourceQuestionId,
                studyId,
                page: 1,
                order: 0,
                text: 'Did you visit the cafe?',
                type: 'YES_NO',
                options: [],
              },
              {
                id: shownWhenYesQuestionId,
                studyId,
                page: 1,
                order: 1,
                text: 'What did you like about the cafe?',
                type: 'FREE_TEXT',
                options: [],
                required: true,
                showIfQuestionId: sourceQuestionId,
                showIfOperator: 'is',
                showIfValue: 'Yes',
              },
              {
                id: shownWhenNotYesQuestionId,
                studyId,
                page: 1,
                order: 2,
                text: 'Why did you skip the cafe?',
                type: 'FREE_TEXT',
                options: [],
                required: true,
                showIfQuestionId: sourceQuestionId,
                showIfOperator: 'is_not',
                showIfValue: 'Yes',
              },
            ],
          },
        }],
      },
      participants: {
        create: {
          userId: user.id,
          consentedAt: new Date(),
        },
      },
    },
  })
  cleanupStudyIds.push(study.id)

  return {
    user,
    studyId,
    partId,
    sourceQuestionId,
    shownWhenYesQuestionId,
    shownWhenNotYesQuestionId,
  }
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

test('participant-specific invite asks mismatched signed-in users to switch accounts', async ({ page }, testInfo) => {
  const db = await requirePrisma()
  const study = await loadSimpleStudy()
  const projectSlug = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const invitedEmail = `qa.invited.${projectSlug}.${testInfo.workerIndex}.${Date.now()}@diari.test`
  await db.studyInvitation.create({
    data: {
      studyId: study.id,
      email: invitedEmail,
      token: `qa${crypto.randomUUID().replaceAll('-', '')}`,
    },
  })

  await loginParticipant(page)
  const invitation = await db.studyInvitation.findUniqueOrThrow({
    where: { studyId_email: { studyId: study.id, email: invitedEmail } },
  })

  await page.goto(`/join/${invitation.token}`)
  await expect(page.getByText(`This invite is for ${invitedEmail}. You are signed in as ${QA_PARTICIPANT_EMAIL}.`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out and continue' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Join study' })).toHaveCount(0)
})

test('participant can request and use a password reset link', async ({ page }, testInfo) => {
  const db = await requirePrisma()
  const projectSlug = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const email = `qa.reset.${projectSlug}.${testInfo.workerIndex}.${Date.now()}@diari.test`
  const originalPassword = 'qa-reset-original-123'
  const user = await db.user.create({
    data: {
      email,
      name: 'QA Reset Participant',
      password: await bcrypt.hash(originalPassword, 12),
      role: 'PARTICIPANT',
    },
  })
  cleanupEmails.push(email)

  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page).toHaveURL(/\/forgot-password/)
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText('If an account exists for that email')).toBeVisible()

  const resetToken = `qa-password-reset-token-${Date.now()}`
  await db.passwordResetToken.deleteMany({ where: { userId: user.id } })
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: passwordResetTokenHash(resetToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  })

  const newPassword = `qa-participant-reset-${Date.now()}`
  await page.goto(`/reset-password?token=${resetToken}`)
  await page.getByLabel('New password').fill(newPassword)
  await page.getByLabel('Confirm password').fill(newPassword)
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page).toHaveURL(/\/login\?reset=success/)
  await expect(page.getByText('Your password has been updated')).toBeVisible()

  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(newPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
})

test('signed-in participant can change their password from profile', async ({ page }, testInfo) => {
  const db = await requirePrisma()
  const projectSlug = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const email = `qa.change-password.${projectSlug}.${testInfo.workerIndex}.${Date.now()}@diari.test`
  const originalPassword = 'qa-change-original-123'
  const newPassword = `qa-change-new-${Date.now()}`
  await db.user.create({
    data: {
      email,
      name: 'QA Password Change',
      password: await bcrypt.hash(originalPassword, 12),
      role: 'PARTICIPANT',
    },
  })
  cleanupEmails.push(email)

  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(originalPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  await page.goto('/profile?from=dashboard&returnTo=/dashboard')
  const currentPasswordInput = page.locator('#current-password')
  await currentPasswordInput.fill(originalPassword)
  await expect(currentPasswordInput).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Show typed characters' }).first().click()
  await expect(currentPasswordInput).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide typed characters' }).first().click()
  await expect(currentPasswordInput).toHaveAttribute('type', 'password')
  await page.getByLabel('New password').fill(newPassword)
  await page.getByLabel('Confirm password').fill(newPassword)
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByText('Password updated.')).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(originalPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Invalid email or password.')).toBeVisible()

  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(newPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
})

test('conditional questions show and submit for is and is not rules', async ({ page }, testInfo) => {
  const db = await requirePrisma()

  async function openFixture(suffix: string) {
    const fixture = await createConditionalStudyFixture(testInfo, suffix)
    const token = await sessionToken({
      id: fixture.user.id,
      role: fixture.user.role,
      name: fixture.user.name,
      email: fixture.user.email,
    })
    await page.context().clearCookies()
    await page.context().addCookies([{
      name: 'session',
      value: token,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax',
      secure: baseURL.startsWith('https://'),
    }])
    await page.goto(`/entry/new?studyId=${fixture.studyId}&partId=${fixture.partId}`)
    await expect(page.getByText('Did you visit the cafe?')).toBeVisible()
    await expect(page.getByText('What did you like about the cafe?')).toHaveCount(0)
    await expect(page.getByText('Why did you skip the cafe?')).toHaveCount(0)
    return fixture
  }

  const yesFixture = await openFixture('yes')
  await page.getByText('Yes', { exact: true }).click()
  await expect(page.getByText('What did you like about the cafe?')).toBeVisible()
  await expect(page.getByText('Why did you skip the cafe?')).toHaveCount(0)
  await page.locator('textarea').fill('The visit worked well.')
  await page.getByRole('button', { name: 'Submit entry' }).click()
  await expect(page).toHaveURL(/\/entry\/[^/]+$/)
  await expect(page.getByText('Entry submitted')).toBeVisible()

  const yesEntry = await db.entry.findFirstOrThrow({
    where: { studyId: yesFixture.studyId, userId: yesFixture.user.id },
    include: { answers: true },
    orderBy: { submittedAt: 'desc' },
  })
  const yesAnswers = new Map(yesEntry.answers.map((answer) => [answer.questionId, answer]))
  expect(yesAnswers.get(yesFixture.shownWhenYesQuestionId)?.wasShown).toBe(true)
  expect(yesAnswers.get(yesFixture.shownWhenYesQuestionId)?.value).toBe('The visit worked well.')
  expect(yesAnswers.get(yesFixture.shownWhenNotYesQuestionId)?.wasShown).toBe(false)
  expect(yesAnswers.get(yesFixture.shownWhenNotYesQuestionId)?.value).toBe('N/A - not shown')

  const noFixture = await openFixture('no')
  await page.getByText('Yes', { exact: true }).click()
  await expect(page.getByText('What did you like about the cafe?')).toBeVisible()
  await page.getByText('No', { exact: true }).click()
  await expect(page.getByText('What did you like about the cafe?')).toHaveCount(0)
  await expect(page.getByText('Why did you skip the cafe?')).toBeVisible()
  await page.locator('textarea').fill('I skipped it this time.')
  await page.getByRole('button', { name: 'Submit entry' }).click()
  await expect(page).toHaveURL(/\/entry\/[^/]+$/)
  await expect(page.getByText('Entry submitted')).toBeVisible()

  const noEntry = await db.entry.findFirstOrThrow({
    where: { studyId: noFixture.studyId, userId: noFixture.user.id },
    include: { answers: true },
    orderBy: { submittedAt: 'desc' },
  })
  const noAnswers = new Map(noEntry.answers.map((answer) => [answer.questionId, answer]))
  expect(noAnswers.get(noFixture.shownWhenYesQuestionId)?.wasShown).toBe(false)
  expect(noAnswers.get(noFixture.shownWhenYesQuestionId)?.value).toBe('N/A - not shown')
  expect(noAnswers.get(noFixture.shownWhenNotYesQuestionId)?.wasShown).toBe(true)
  expect(noAnswers.get(noFixture.shownWhenNotYesQuestionId)?.value).toBe('I skipped it this time.')
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
  await expect(page.locator('input[name="timezone"]')).toHaveValue('Europe/Zurich')
  await expectNoHorizontalOverflow(page, 'Simple entry form')
  await page.locator(`textarea[name="question_${question.id}"]`).fill(answer)
  await page.getByRole('button', { name: 'Submit entry' }).click()

  await expect(page.getByText('Entry submitted')).toBeVisible()
  await expect(page.getByText(answer)).toBeVisible()

  await loginAdminByCookie(page)
  await page.goto(`/admin/studies/${study.id}/data`)
  await expect(page.getByText(answer)).toBeVisible()
})

test('journey reminder destination opens the dashboard with stage choices', async ({ page }) => {
  const { study, journey } = await loadJourneyStudy()
  const firstStage = study.parts[0]
  const secondStage = study.parts[1]
  const submittedPartIds = new Set(journey.entries.map((entry) => entry.partId))
  const targetStage = study.parts.find((part) => !submittedPartIds.has(part.id)) ?? firstStage

  await loginParticipant(page)
  await page.goto('/dashboard')

  await expect(page.locator('h2', { hasText: JOURNEY_STUDY_NAME })).toBeVisible()
  await expect(page.getByText(firstStage.name, { exact: true })).toBeVisible()
  await expect(page.getByText(secondStage.name, { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page, 'Journey dashboard')

  const targetStageLink = page.locator(
    `a[href*="studyId=${study.id}"][href*="partId=${targetStage.id}"][href*="journeyId=${journey.id}"]`
  )
  await expect(targetStageLink).toBeVisible()
  await targetStageLink.click()

  await expect(page).toHaveURL((url) =>
    url.pathname === '/entry/new'
    && url.searchParams.get('studyId') === study.id
    && url.searchParams.get('partId') === targetStage.id
    && url.searchParams.get('journeyId') === journey.id
  )
  await expect(page.getByText(targetStage.questions[0].text)).toBeVisible()
  await expectNoHorizontalOverflow(page, 'Journey entry form')
})

test('researcher setup page stays readable without horizontal overflow', async ({ page }) => {
  const study = await loadSimpleStudy()
  await loginAdminByCookie(page)

  await page.goto(`/admin/studies/${study.id}/edit`)
  await expect(page.getByRole('heading', { name: SIMPLE_STUDY_NAME })).toBeVisible()
  await expect(page.getByLabel('Study name *')).toBeVisible()

  await page.locator('button[aria-haspopup="listbox"]').filter({ hasText: 'Free text' }).first().click()
  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible()
  await expect(listbox).toContainText('Free text')
  await expect(listbox).toContainText('Event date / time')
  await expect(await listbox.evaluate((node) => node.parentElement === document.body)).toBe(true)
  await page.keyboard.press('Escape')

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

test('researcher can invite an admin who sets their password', async ({ page }, testInfo) => {
  const db = await requirePrisma()
  const projectSlug = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const email = `qa.team-admin.${projectSlug}.${testInfo.workerIndex}.${Date.now()}@diari.test`
  const newPassword = `qa-team-admin-${Date.now()}`
  cleanupEmails.push(email)

  await loginAdminByCookie(page)
  await page.goto('/profile?from=admin&returnTo=/admin')
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Team access' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Optional profile questions' })).toHaveCount(0)
  await expect(page.getByText('Admins can manage studies')).toBeVisible()

  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Name').fill('QA Team Admin')
  await page.getByRole('button', { name: 'Invite admin' }).click()

  await expect(page.getByText(/Admin access added/)).toBeVisible()
  const setupUrl = await page.getByLabel('Admin setup link').inputValue()
  expect(setupUrl).toContain('/reset-password?token=')

  const invited = await db.user.findUnique({ where: { email } })
  expect(invited?.role).toBe('ADMIN')

  await page.context().clearCookies()
  await page.goto(setupUrl)
  await page.getByLabel('New password').fill(newPassword)
  await page.getByLabel('Confirm password').fill(newPassword)
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page).toHaveURL(/\/login\?reset=success/)

  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(newPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/admin/)
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0)
})

test('researcher can remove another admin access', async ({ page }, testInfo) => {
  const db = await requirePrisma()
  const projectSlug = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const email = `qa.remove-admin.${projectSlug}.${testInfo.workerIndex}.${Date.now()}@diari.test`
  cleanupEmails.push(email)
  const target = await db.user.create({
    data: {
      email,
      name: 'QA Remove Admin',
      password: await bcrypt.hash('qa-remove-admin-123', 12),
      role: 'ADMIN',
    },
  })

  await loginAdminByCookie(page)
  await page.goto('/profile?from=admin&returnTo=/admin')
  await expect(page.getByText(email)).toBeVisible()
  await page.getByRole('button', { name: 'Remove admin access for QA Remove Admin' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText(email)).toHaveCount(0)

  const updated = await db.user.findUnique({ where: { id: target.id } })
  expect(updated?.role).toBe('PARTICIPANT')
})

test('researcher invite form returns from sending and exposes the invite link', async ({ page }, testInfo) => {
  const db = await requirePrisma()
  const study = await loadSimpleStudy()
  const projectSlug = testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const email = `qa.form-invite.${projectSlug}.${testInfo.workerIndex}.${Date.now()}@diari.test`
  cleanupInvitationEmails.push(email)
  await db.studyInvitation.deleteMany({ where: { studyId: study.id, email } })

  await loginAdminByCookie(page)
  await page.goto(`/admin/studies/${study.id}/participants`)
  const invitePanel = page.locator('section', { has: page.getByRole('heading', { name: 'Invite participant' }) })
  await invitePanel.getByPlaceholder('Participant email address').fill(email)
  await invitePanel.getByRole('button', { name: 'Send invitation' }).click()

  await expect(invitePanel.getByRole('button', { name: /Sending/ })).toHaveCount(0, { timeout: 12_000 })
  await expect(invitePanel.getByText(/Invitation saved|Participant added/)).toBeVisible()
  await expect(invitePanel.getByLabel('Participant invite link')).toHaveValue(/\/join\//)
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
  await expect(page.getByText(/\d+ entries · \d+ participants · \d+% completion/)).toBeVisible()
  await expect(page.getByText('Answer completion')).toBeVisible()
  await expect(page.getByText('Missing answers')).toBeVisible()
  await expect(page.getByText('Journey continuity')).toBeVisible()
  await expect(page.getByText('Stage coverage')).toBeVisible()
  await expectNoHorizontalOverflow(page, 'Researcher analysis dashboard')
})

test('researcher analysis summarizes free-text themes instead of raw tag lists', async ({ page }) => {
  const db = await requirePrisma()
  const entry = await ensureSimpleAnalysisEntry()
  const study = await loadSimpleStudy()
  const question = study.parts[0].questions[0]
  const answer = await db.answer.findFirstOrThrow({
    where: { entryId: entry.id, questionId: question.id },
  })
  const suffix = `${Date.now()}-${test.info().workerIndex}`
  const theme = await db.questionTag.create({
    data: {
      questionId: question.id,
      label: `QA Theme ${suffix}`,
      color: '#4f46e5',
      isTheme: true,
      sortOrder: 1,
    },
  })
  const childTag = await db.questionTag.create({
    data: {
      questionId: question.id,
      label: `QA Code ${suffix}`,
      color: '#0d9488',
      parentId: theme.id,
      sortOrder: 2,
    },
  })
  cleanupTagIds.push(theme.id, childTag.id)
  await db.answerTag.create({
    data: {
      answerId: answer.id,
      tagId: childTag.id,
    },
  })

  await loginAdminByCookie(page)
  await page.goto(`/admin/studies/${study.id}/analysis`)
  await expect(page.getByText('Theme distribution')).toBeVisible()
  await expect(page.getByText(theme.label)).toBeVisible()
  await expect(page.getByText(childTag.label)).toHaveCount(0)
})

test('researcher can reorder and delete selected tags in the tag lab', async ({ page }) => {
  const db = await requirePrisma()
  await ensureSimpleAnalysisEntry()
  const study = await loadSimpleStudy()
  const question = study.parts[0].questions[0]
  const suffix = `${Date.now()}-${test.info().workerIndex}`
  const firstTag = await db.questionTag.create({
    data: {
      questionId: question.id,
      label: `QA First ${suffix}`,
      color: '#4f46e5',
      sortOrder: 1000,
    },
  })
  const secondTag = await db.questionTag.create({
    data: {
      questionId: question.id,
      label: `QA Second ${suffix}`,
      color: '#0d9488',
      sortOrder: 2000,
    },
  })
  cleanupTagIds.push(firstTag.id, secondTag.id)

  await loginAdminByCookie(page)
  await page.goto(`/admin/studies/${study.id}/analysis/${question.id}/tag`)
  await expect(page.getByRole('heading', { name: question.text })).toBeVisible()

  await page.getByLabel(`Drag ${firstTag.label}`).focus()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(page.getByText(`Moved ${firstTag.label} down.`)).toBeVisible()
  await expect.poll(async () => {
    const [first, second] = await Promise.all([
      db.questionTag.findUniqueOrThrow({ where: { id: firstTag.id }, select: { sortOrder: true } }),
      db.questionTag.findUniqueOrThrow({ where: { id: secondTag.id }, select: { sortOrder: true } }),
    ])
    return first.sortOrder > second.sortOrder
  }).toBe(true)

  await page.getByLabel(`Select ${secondTag.label}`).check()
  await page.getByLabel('Delete selected tags').click()
  await expect(page.getByText('Delete 1 selected tag?')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByLabel(`Select ${secondTag.label}`)).toHaveCount(0)
  await expect.poll(async () => db.questionTag.count({ where: { id: secondTag.id } })).toBe(0)
})

test('researcher can delete a selected theme without deleting its tags', async ({ page }) => {
  const db = await requirePrisma()
  await ensureSimpleAnalysisEntry()
  const study = await loadSimpleStudy()
  const question = study.parts[0].questions[0]
  const suffix = `${Date.now()}-${test.info().workerIndex}`
  const theme = await db.questionTag.create({
    data: {
      questionId: question.id,
      label: `QA Theme Delete ${suffix}`,
      color: '#7c3aed',
      isTheme: true,
      sortOrder: 1000,
    },
  })
  const childTag = await db.questionTag.create({
    data: {
      questionId: question.id,
      label: `QA Child Survives ${suffix}`,
      color: '#d97706',
      parentId: theme.id,
      sortOrder: 1000,
    },
  })
  cleanupTagIds.push(theme.id, childTag.id)

  await loginAdminByCookie(page)
  await page.goto(`/admin/studies/${study.id}/analysis/${question.id}/tag`)
  await expect(page.getByRole('heading', { name: question.text })).toBeVisible()

  await page.getByLabel(`Select ${theme.label}`).check()
  await page.getByLabel('Delete selected themes').click()
  await expect(page.getByText('Delete 1 selected theme? Tags will stay ungrouped.')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm' }).click()

  await expect(page.getByLabel(`Select ${theme.label}`)).toHaveCount(0)
  await expect(page.getByLabel(`Select ${childTag.label}`)).toBeVisible()
  await expect.poll(async () => {
    const [themeCount, child] = await Promise.all([
      db.questionTag.count({ where: { id: theme.id } }),
      db.questionTag.findUniqueOrThrow({ where: { id: childTag.id }, select: { parentId: true } }),
    ])
    return { themeCount, childParentId: child.parentId }
  }).toEqual({ themeCount: 0, childParentId: null })
})
