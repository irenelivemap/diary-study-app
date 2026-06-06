import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const email = process.argv[2]
  const password = process.argv[3]
  const name = process.argv[4] ?? 'Admin'

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email> <password> [name]')
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
