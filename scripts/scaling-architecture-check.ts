import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function read(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

function walk(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`
    const fullPath = join(root, path)
    if (statSync(fullPath).isDirectory()) return walk(path)
    return [path]
  })
}

const dataPage = read('app/admin/studies/[id]/data/page.tsx')
const analysisPage = read('app/admin/studies/[id]/analysis/page.tsx')
const dashboardPage = read('app/dashboard/page.tsx')
const db = read('app/lib/db.ts')
const envExample = read('.env.example')

assert.match(dataPage, /loadStudyDataTableData/, 'Data page should load through the dedicated data-table module.')
assert.match(analysisPage, /loadStudyAnalysisData/, 'Analysis page should load through the dedicated analysis module.')
assert.match(dashboardPage, /loadParticipantDashboardData/, 'Participant dashboard page should load through the dedicated dashboard data module.')
assert.doesNotMatch(dashboardPage, /from ['"]@\/app\/lib\/db['"]/, 'Participant dashboard page should not import Prisma directly.')
assert.match(db, /resolveDatabaseUrl/, 'App Prisma client should use the shared database URL resolver.')
assert.match(envExample, /sslmode=verify-full/, '.env.example should use explicit sslmode=verify-full.')

for (const file of [...walk('scripts'), ...walk('tests')]) {
  if (!/\.(ts|tsx)$/.test(file)) continue
  const source = read(file)
  assert.doesNotMatch(
    source,
    /connectionString:\s*process\.env\.DATABASE_URL!?/,
    `${file} should use resolveDatabaseUrl() instead of passing DATABASE_URL directly to PrismaPg.`
  )
}

console.log('Scaling architecture checks passed.')
