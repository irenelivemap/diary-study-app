import 'dotenv/config'
import { SignJWT } from 'jose'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

type QaResult = {
  name: string
  ok: boolean
  detail: string
}

const QA_PARTICIPANT_EMAIL = process.env.QA_PARTICIPANT_EMAIL || 'qa.participant@diari.test'
const SIMPLE_STUDY_NAME = 'QA Smoke — Simple Diary'
const JOURNEY_STUDY_NAME = 'QA Smoke — Journey Study'
const baseUrl = normalizeBaseUrl(process.env.QA_BASE_URL || process.env.SMOKE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000')
const results: QaResult[] = []

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return 'http://localhost:3000'
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function pathUrl(path: string) {
  return `${baseUrl}${path}`
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

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')

  const participant = await prisma.user.findUnique({ where: { email: QA_PARTICIPANT_EMAIL } })
  assert(participant, `QA participant not found. Run npm run qa:seed first.`)
  assert(participant.role === 'PARTICIPANT', `QA user must be PARTICIPANT, got ${participant.role}.`)

  const simpleStudy = await prisma.study.findFirst({
    where: { name: SIMPLE_STUDY_NAME },
    include: { parts: { orderBy: { order: 'asc' }, include: { questions: { orderBy: { order: 'asc' } } } } },
  })
  const journeyStudy = await prisma.study.findFirst({
    where: { name: JOURNEY_STUDY_NAME },
    include: {
      parts: { orderBy: { order: 'asc' }, include: { questions: { orderBy: { order: 'asc' } } } },
      journeys: { where: { userId: participant.id }, orderBy: { createdAt: 'desc' } },
    },
  })
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
