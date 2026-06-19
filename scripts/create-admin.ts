/**
 * Creates an initial admin account from the command line when setting up or recovering an environment.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { resolveDatabaseUrl } from '../app/lib/database-url'

const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() })
const prisma = new PrismaClient({ adapter })

function normalizeEmail(value: string | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function main() {
  const email = normalizeEmail(process.argv[2])
  const password = process.argv[3] ?? ''
  const name = (process.argv[4] ?? 'Admin').trim()

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email> <password> [name]')
    process.exit(1)
  }
  if (!isValidEmail(email)) {
    console.error('Email is not valid.')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.')
    process.exit(1)
  }

  const hashed = await bcrypt.hash(password, 12)
  const user = await prisma.user.upsert({
    where: { email },
    update: { password: hashed, role: 'ADMIN', name },
    create: { email, password: hashed, name, role: 'ADMIN' },
  })

  console.log(`Admin created: ${user.email} (id: ${user.id})`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
