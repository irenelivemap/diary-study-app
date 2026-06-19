/**
 * Guards query and pagination patterns added to keep larger studies usable.
 */
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
const participantsPage = read('app/admin/studies/[id]/participants/page.tsx')
const dashboardPage = read('app/dashboard/page.tsx')
const db = read('app/lib/db.ts')
const envExample = read('.env.example')

assert.match(dataPage, /loadStudyDataTableData/, 'Data page should load through the dedicated data-table module.')
assert.match(dataPage, /parseStudyDataTableFilters/, 'Data page should pass URL filters into the server-side data-table loader.')
assert.match(analysisPage, /loadStudyAnalysisData/, 'Analysis page should load through the dedicated analysis module.')
assert.match(analysisPage, /parseStudyAnalysisFilters/, 'Analysis page should pass URL filters into the server-side analysis loader.')
assert.match(participantsPage, /loadStudyParticipantsData/, 'Participants page should load through the dedicated participants module.')
assert.doesNotMatch(participantsPage, /from ['"]@\/app\/lib\/db['"]/, 'Participants page should not import Prisma directly.')
assert.match(dashboardPage, /loadParticipantDashboardData/, 'Participant dashboard page should load through the dedicated dashboard data module.')
assert.doesNotMatch(dashboardPage, /from ['"]@\/app\/lib\/db['"]/, 'Participant dashboard page should not import Prisma directly.')
assert.match(db, /resolveDatabaseUrl/, 'App Prisma client should use the shared database URL resolver.')
assert.match(envExample, /sslmode=verify-full/, '.env.example should use explicit sslmode=verify-full.')

const dataExplorer = read('app/components/DataExplorer.tsx')
assert.match(dataExplorer, /router\.replace/, 'Data table filters should update the URL so filtering can run on the server.')
assert.doesNotMatch(dataExplorer, /filterDatasetRowsByPilot/, 'Data table should not filter pilot rows from a full entry dataset in the browser.')

const analysisDashboard = read('app/components/AnalysisDashboard.tsx')
const analysisData = read('app/lib/study-analysis-data.ts')
assert.match(analysisDashboard, /updateAnalysisFilters/, 'Analysis filters should update the URL so row filtering can run on the server.')
assert.match(analysisDashboard, /questionSummaries/, 'Analysis dashboard should receive server-prepared per-question chart summaries.')
assert.match(analysisData, /questionSummaries/, 'Analysis data loader should prepare per-question chart summaries on the server.')
assert.match(analysisData, /compactQuestionAnalysis/, 'Analysis chart summaries should avoid sending raw answer arrays to the browser.')
assert.doesNotMatch(analysisDashboard, /rows\.filter\(\(row\) => \{[\s\S]*if \(!includePilotData/, 'Analysis dashboard should not apply the main row filter in the browser.')

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
