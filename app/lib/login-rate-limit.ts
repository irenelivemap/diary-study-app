import 'server-only'
import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { prisma } from '@/app/lib/db'

const MAX_FAILED_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const BLOCK_MS = 15 * 60 * 1000

type LimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

function hashIdentifier(value: string) {
  const salt = process.env.SESSION_SECRET ?? 'diari-login-rate-limit'
  return createHash('sha256').update(`${salt}:${value}`).digest('hex')
}

function retryAfterSeconds(blockedUntil: Date, now = new Date()) {
  return Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000))
}

async function clientIpKey() {
  const requestHeaders = await headers()
  const forwardedFor = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
  const realIp = requestHeaders.get('x-real-ip')?.trim()
  const ip = forwardedFor || realIp
  return ip ? `ip:${hashIdentifier(ip)}` : null
}

export async function loginRateLimitKeys(email: string) {
  const keys = [`email:${hashIdentifier(email)}`]
  const ip = await clientIpKey()
  if (ip) keys.push(ip)
  return keys
}

export async function checkLoginRateLimit(keys: string[]): Promise<LimitResult> {
  if (keys.length === 0) return { allowed: true }

  const now = new Date()
  const records = await prisma.loginRateLimit.findMany({
    where: { key: { in: keys } },
    select: { blockedUntil: true },
  })
  const activeBlock = records
    .map((record) => record.blockedUntil)
    .filter((blockedUntil): blockedUntil is Date => Boolean(blockedUntil && blockedUntil > now))
    .sort((a, b) => b.getTime() - a.getTime())[0]

  if (!activeBlock) return { allowed: true }
  return { allowed: false, retryAfterSeconds: retryAfterSeconds(activeBlock, now) }
}

export async function recordFailedLogin(keys: string[]) {
  if (keys.length === 0) return

  const now = new Date()
  const resetAt = new Date(now.getTime() + WINDOW_MS)
  const blockedUntil = new Date(now.getTime() + BLOCK_MS)

  await prisma.$transaction(keys.map((key) => (
    prisma.loginRateLimit.upsert({
      where: { key },
      create: { key, attempts: 1, resetAt, blockedUntil: null },
      update: {
        attempts: {
          increment: 1,
        },
      },
    })
  )))

  const records = await prisma.loginRateLimit.findMany({
    where: { key: { in: keys } },
    select: { key: true, attempts: true, resetAt: true },
  })

  await prisma.$transaction(records.map((record) => {
    const windowExpired = record.resetAt <= now
    const attempts = windowExpired ? 1 : record.attempts
    return prisma.loginRateLimit.update({
      where: { key: record.key },
      data: {
        attempts,
        resetAt: windowExpired ? resetAt : record.resetAt,
        blockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? blockedUntil : null,
      },
    })
  }))
}

export async function clearLoginRateLimit(keys: string[]) {
  if (keys.length === 0) return
  await prisma.loginRateLimit.deleteMany({ where: { key: { in: keys } } })
}
