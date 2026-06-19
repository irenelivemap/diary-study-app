import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { resolveDatabaseUrl } from '../app/lib/database-url'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to review query plans.')
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: resolveDatabaseUrl() }),
})

type PlanRow = { 'QUERY PLAN': string }

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

async function explain(name: string, sql: string) {
  console.log(`\n--- ${name} ---`)
  const rows = await prisma.$queryRawUnsafe<PlanRow[]>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`)
  for (const row of rows) console.log(row['QUERY PLAN'])
}

async function main() {
  const study = await prisma.study.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  if (!study) {
    console.log('No studies found. Seed or connect to a production-like database before reviewing indexes.')
    return
  }

  await explain(
    'Recent study entries',
    `SELECT id, "submittedAt"
     FROM "Entry"
     WHERE "studyId" = ${sqlString(study.id)} AND "isPilot" = false
     ORDER BY "submittedAt" DESC
     LIMIT 20`
  )

  await explain(
    'Entries grouped by participant and part',
    `SELECT "userId", "partId", count(*)
     FROM "Entry"
     WHERE "studyId" = ${sqlString(study.id)} AND "isPilot" = false
     GROUP BY "userId", "partId"`
  )

  await explain(
    'Answers for a study through entries',
    `SELECT a.id, a."questionId"
     FROM "Answer" a
     JOIN "Entry" e ON e.id = a."entryId"
     WHERE e."studyId" = ${sqlString(study.id)} AND e."isPilot" = false
     LIMIT 100`
  )

  console.log('\nReview guidance:')
  console.log('- Prefer index scans or bitmap index scans for large tables.')
  console.log('- Sequential scans are acceptable only when the table is small or the planner reads most rows intentionally.')
  console.log('- Re-run this after importing production-like study data and after adding new researcher filters.')
}

main()
  .finally(async () => {
    await prisma.$disconnect()
  })
