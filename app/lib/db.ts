/**
 * Creates the shared Prisma client used by server-side code.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { resolveDatabaseUrl } from '@/app/lib/database-url'

function createPrisma() {
  const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error'] : [],
  })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createPrisma()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
