/**
 * Runs an authenticated HTTP-level QA flow across participant and admin routes.
 */
import 'dotenv/config'
import { SignJWT } from 'jose'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { resolveDatabaseUrl } from '../app/lib/database-url'

type QaResult = {
  name: string
  ok: boolean
  detail: string
}

type QaPart = NonNullable<Awaited<ReturnType<typeof loadQaStudy>>>['parts'][number]

const QA_PARTICIPANT_EMAIL = process.env.QA_PARTICIPANT_EMAIL || 'qa.participant@diari.test'
const SIMPLE_STUDY_NAME = 'QA Smoke — Simple Diary'
const JOURNEY_STUDY_NAME = 'QA Smoke — Journey Study'
const baseUrl = normalizeBaseUrl(process.env.QA_BASE_URL || process.env.SMOKE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000')
const results: QaResult[] = []

const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() })
const prisma = new PrismaClient({ adapter })

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return 'http://localhost:3000'
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function pathUrl(path: string) {
  return `${baseUrl}${path}`
}

function localDate(timeZone = 'Europe/Zurich') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function record(name: string, run: () => Promise<string>) {
  try {
    const detail = await run()
    results.push({ name, ok: true, detail })
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : 'Unknown failure',
    })
  }
}

function locationPath(response: Response) {
  const location = response.headers.get('location')
  if (!location) return null
  try {
    return new URL(location, baseUrl).pathname
  } catch {
    return location
  }
}

async function fetchText(url: string, cookie?: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(cookie ? { cookie } : {}),
    },
  })
  const text = await response.text()
  return { response, text }
}

async function sessionCookie(user: { id: string; role: 'ADMIN' | 'PARTICIPANT'; name: string; email: string }) {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is required.')
  const encodedKey = new TextEncoder().encode(secret)
  const token = await new SignJWT({
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)
  return `session=${token}`
}

function loadQaStudy(name: string, userId?: string) {
  return prisma.study.findFirst({
    where: { name },
    include: {
      parts: { orderBy: { order: 'asc' }, include: { questions: { orderBy: { order: 'asc' } } } },
      journeys: userId ? { where: { userId }, orderBy: { createdAt: 'desc' } } : false,
    },
  })
}

async function cleanQaEntries(studyId: string, userId: string) {
  await prisma.entry.deleteMany({ where: { studyId, userId } })
  await prisma.journey.updateMany({
    where: { studyId, userId },
    data: { completedAt: null },
  })
}

async function createQaEntry({
  studyId,
  part,
  userId,
  journeyId,
  answer,
}: {
  studyId: string
  part: QaPart
  userId: string
  journeyId?: string | null
  answer: string
}) {
  const question = part.questions.find((candidate) => candidate.type !== 'CONTENT')
  assert(question, `Part ${part.name} has no answerable question.`)
  return prisma.entry.create({
    data: {
      studyId,
      partId: part.id,
      userId,
      journeyId,
      date: localDate(),
      timezone: 'Europe/Zurich',
      qualityFlags: [],
      answers: {
        create: {
          questionId: question.id,
          value: answer,
          wasShown: true,
        },
      },
    },
    include: { answers: true },
  })
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')

  const participant = await prisma.user.findUnique({ where: { email: QA_PARTICIPANT_EMAIL } })
  assert(participant, `QA participant not found. Run npm run qa:seed first.`)
  assert(participant.role === 'PARTICIPANT', `QA user must be PARTICIPANT, got ${participant.role}.`)
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } })
  assert(admin, 'No admin user found. Create an admin before running QA flow.')

  const simpleStudy = await loadQaStudy(SIMPLE_STUDY_NAME)
  const journeyStudy = await loadQaStudy(JOURNEY_STUDY_NAME, participant.id)
  assert(simpleStudy, `Simple QA study not found. Run npm run qa:seed first.`)
  assert(journeyStudy, `Journey QA study not found. Run npm run qa:seed first.`)

  const simplePart = simpleStudy.parts.find((part) => part.flow !== 'JOURNEY_STAGE')
  const journeyPart = journeyStudy.parts.find((part) => part.flow === 'JOURNEY_STAGE')
  const journey = journeyStudy.journeys[0]
  assert(simplePart, 'Simple QA study has no standard part.')
  assert(simplePart.questions[0], 'Simple QA study has no question.')
  assert(journeyPart, 'Journey QA study has no journey stage.')
  assert(journeyPart.questions[0], 'Journey QA stage has no question.')
  assert(journey, 'Journey QA study has no open journey.')

  const cookie = await sessionCookie({
    id: participant.id,
    role: participant.role,
    name: participant.name,
    email: participant.email,
  })
  const adminCookie = await sessionCookie({
    id: admin.id,
    role: admin.role,
    name: admin.name,
    email: admin.email,
  })
  const simpleAnswer = `QA simple submission ${Date.now()}`
  const journeyAnswer = `QA journey submission ${Date.now()}`
  let simpleEntryId = ''
  let journeyEntryId = ''

  await cleanQaEntries(simpleStudy.id, participant.id)
  await cleanQaEntries(journeyStudy.id, participant.id)

  await record('Logged-out dashboard redirects to login', async () => {
    const response = await fetch(pathUrl('/dashboard'), { redirect: 'manual' })
    const redirectPath = locationPath(response)
    assert([301, 302, 303, 307, 308].includes(response.status), `Expected redirect, got ${response.status}`)
    assert(redirectPath === '/login', `Expected /login redirect, got ${redirectPath ?? 'no location'}`)
    return `${response.status} -> ${redirectPath}`
  })

  await record('Participant dashboard loads without researcher controls', async () => {
    const { response, text } = await fetchText(pathUrl('/dashboard'), cookie)
    assert(response.ok, `Expected dashboard 200, got ${response.status}`)
    assert(text.includes(SIMPLE_STUDY_NAME), 'Dashboard does not show the simple QA study.')
    assert(text.includes(JOURNEY_STUDY_NAME), 'Dashboard does not show the journey QA study.')
    assert(!text.includes('Researcher view'), 'Participant dashboard exposes Researcher view.')
    return `${response.status} ${response.statusText}`
  })

  await record('Participant cannot open researcher admin', async () => {
    const response = await fetch(pathUrl('/admin'), { headers: { cookie }, redirect: 'manual' })
    const redirectPath = locationPath(response)
    assert([301, 302, 303, 307, 308].includes(response.status), `Expected redirect, got ${response.status}`)
    assert(redirectPath === '/dashboard', `Expected /dashboard redirect, got ${redirectPath ?? 'no location'}`)
    return `${response.status} -> ${redirectPath}`
  })

  await record('Profile preserves participant return path', async () => {
    const { response, text } = await fetchText(pathUrl('/profile?from=dashboard&returnTo=/dashboard'), cookie)
    assert(response.ok, `Expected profile 200, got ${response.status}`)
    assert(text.includes('Profile'), 'Profile page did not render.')
    assert(text.includes('href="/dashboard"') || text.includes('href=\\x22/dashboard\\x22'), 'Profile page does not include a dashboard back link.')
    return `${response.status} ${response.statusText}`
  })

  await record('Simple entry form opens directly', async () => {
    const { response, text } = await fetchText(pathUrl(`/entry/new?studyId=${simpleStudy.id}&partId=${simplePart.id}`), cookie)
    assert(response.ok, `Expected simple entry form 200, got ${response.status}`)
    assert(text.includes(simplePart.questions[0].text), 'Simple entry form did not show the QA question.')
    return `${response.status} ${response.statusText}`
  })

  await record('Journey stage form opens from current journey', async () => {
    const { response, text } = await fetchText(pathUrl(`/entry/new?studyId=${journeyStudy.id}&partId=${journeyPart.id}&journeyId=${journey.id}`), cookie)
    assert(response.ok, `Expected journey stage form 200, got ${response.status}`)
    assert(text.includes(journeyPart.questions[0].text), 'Journey entry form did not show the QA stage question.')
    return `${response.status} ${response.statusText}`
  })

  await record('Simple QA submission is stored', async () => {
    const entry = await createQaEntry({
      studyId: simpleStudy.id,
      part: simplePart,
      userId: participant.id,
      answer: simpleAnswer,
    })
    simpleEntryId = entry.id
    assert(entry.answers[0]?.value === simpleAnswer, 'Stored simple answer does not match.')
    return `entry ${entry.id}`
  })

  await record('Journey QA submission is stored', async () => {
    const entry = await createQaEntry({
      studyId: journeyStudy.id,
      part: journeyPart,
      userId: participant.id,
      journeyId: journey.id,
      answer: journeyAnswer,
    })
    journeyEntryId = entry.id
    assert(entry.answers[0]?.value === journeyAnswer, 'Stored journey answer does not match.')
    return `entry ${entry.id}`
  })

  await record('Stored simple entry renders read-only', async () => {
    const { response, text } = await fetchText(pathUrl(`/entry/${simpleEntryId}`), cookie)
    assert(response.ok, `Expected simple entry read-only page 200, got ${response.status}`)
    assert(text.includes(simpleAnswer), 'Read-only simple entry page did not show the stored answer.')
    return `${response.status} ${response.statusText}`
  })

  await record('Stored journey entry renders read-only', async () => {
    const { response, text } = await fetchText(pathUrl(`/entry/${journeyEntryId}`), cookie)
    assert(response.ok, `Expected journey entry read-only page 200, got ${response.status}`)
    assert(text.includes(journeyAnswer), 'Read-only journey entry page did not show the stored answer.')
    return `${response.status} ${response.statusText}`
  })

  await record('Dashboard reflects QA submissions', async () => {
    const { response, text } = await fetchText(pathUrl('/dashboard'), cookie)
    assert(response.ok, `Expected dashboard 200 after submissions, got ${response.status}`)
    assert(text.includes('Submitted') || text.includes('submitted'), 'Dashboard did not show a submitted state after QA entries.')
    return `${response.status} ${response.statusText}`
  })

  await record('Admin dashboard loads QA studies', async () => {
    const { response, text } = await fetchText(pathUrl('/admin'), adminCookie)
    assert(response.ok, `Expected admin dashboard 200, got ${response.status}`)
    assert(text.includes(SIMPLE_STUDY_NAME), 'Admin dashboard does not show the simple QA study.')
    assert(text.includes(JOURNEY_STUDY_NAME), 'Admin dashboard does not show the journey QA study.')
    return `${response.status} ${response.statusText}`
  })

  await record('Admin study overview loads entries', async () => {
    const { response, text } = await fetchText(pathUrl(`/admin/studies/${simpleStudy.id}`), adminCookie)
    assert(response.ok, `Expected admin study overview 200, got ${response.status}`)
    assert(text.includes(SIMPLE_STUDY_NAME), 'Admin study overview does not show the QA study name.')
    assert(text.includes('Participants'), 'Admin study overview does not show study tabs or participant context.')
    return `${response.status} ${response.statusText}`
  })

  await record('Admin participants page shows QA participant', async () => {
    const { response, text } = await fetchText(pathUrl(`/admin/studies/${simpleStudy.id}/participants`), adminCookie)
    assert(response.ok, `Expected participants page 200, got ${response.status}`)
    assert(text.includes(QA_PARTICIPANT_EMAIL), 'Participants page does not show the QA participant.')
    return `${response.status} ${response.statusText}`
  })

  await record('Admin participant detail shows stored entry', async () => {
    const { response, text } = await fetchText(pathUrl(`/admin/studies/${simpleStudy.id}/participants/${participant.id}`), adminCookie)
    assert(response.ok, `Expected participant detail 200, got ${response.status}`)
    assert(text.includes(simpleAnswer), 'Participant detail does not show the stored simple answer.')
    return `${response.status} ${response.statusText}`
  })

  await record('Admin data page shows stored answer', async () => {
    const { response, text } = await fetchText(pathUrl(`/admin/studies/${simpleStudy.id}/data`), adminCookie)
    assert(response.ok, `Expected data page 200, got ${response.status}`)
    assert(text.includes(simpleAnswer), 'Data page does not include the stored simple answer.')
    return `${response.status} ${response.statusText}`
  })

  await record('Admin analysis page loads', async () => {
    const { response, text } = await fetchText(pathUrl(`/admin/studies/${simpleStudy.id}/analysis`), adminCookie)
    assert(response.ok, `Expected analysis page 200, got ${response.status}`)
    assert(text.includes(SIMPLE_STUDY_NAME), 'Analysis page does not show the QA study name.')
    assert(text.includes('Analysis') || text.includes('Free text'), 'Analysis page did not render expected analysis context.')
    return `${response.status} ${response.statusText}`
  })

  await record('Admin export returns CSV with stored answer', async () => {
    const { response, text } = await fetchText(pathUrl(`/admin/studies/${simpleStudy.id}/export`), adminCookie)
    assert(response.ok, `Expected export 200, got ${response.status}`)
    assert(response.headers.get('content-type')?.includes('text/csv'), `Expected text/csv export, got ${response.headers.get('content-type')}`)
    assert(text.includes(simpleAnswer), 'CSV export does not include the stored simple answer.')
    assert(text.includes('participant_id'), 'CSV export does not include anonymized participant IDs by default.')
    assert(!text.includes('participant_email'), 'CSV export should not include participant emails by default.')
    assert(!text.includes('demographic_'), 'CSV export should not include demographics when anonymized by default.')
    return `${response.status} ${response.statusText}`
  })

  await record('Admin identifiable export includes participant metadata when requested', async () => {
    const { response, text } = await fetchText(pathUrl(`/admin/studies/${simpleStudy.id}/export?anonymize=false`), adminCookie)
    assert(response.ok, `Expected identifiable export 200, got ${response.status}`)
    assert(text.includes('participant_email'), 'Identifiable CSV export does not include participant email header.')
    assert(text.includes('demographic_age_range'), 'Identifiable CSV export does not include demographic headers.')
    assert(text.includes(QA_PARTICIPANT_EMAIL), 'Identifiable CSV export does not include the QA participant email.')
    return `${response.status} ${response.statusText}`
  })

  console.log(`\nQA participant flow for ${baseUrl}\n`)
  for (const result of results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`)
    console.log(`     ${result.detail}`)
  }

  const failed = results.filter((result) => !result.ok)
  if (failed.length > 0) {
    console.error(`\n${failed.length} QA check${failed.length === 1 ? '' : 's'} failed.`)
    process.exit(1)
  }

  console.log('\nAll QA participant flow checks passed.')
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
