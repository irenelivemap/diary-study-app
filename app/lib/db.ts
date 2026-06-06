import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

function databaseUrl() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  // Neon commonly gives sslmode=require. The pg driver currently treats it as
  // verify-full and warns that this will change, which triggers Next's dev
  // overlay. Make the current behavior explicit before pg parses the URL.
  return url.replace('sslmode=require', 'sslmode=verify-full')
}

function createPrisma() {
  const adapter = new PrismaPg({ connectionString: databaseUrl() })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error'] : [],
  })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createPrisma()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
