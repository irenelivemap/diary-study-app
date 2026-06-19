/**
 * Checks that shared study layout and route structure remain consistent.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const studyRouteRoot = join(root, 'app/admin/studies/[id]')
const sharedLayout = readFileSync(join(studyRouteRoot, 'layout.tsx'), 'utf8')

assert.match(sharedLayout, /loadStudyShellData/, 'Study layout should load the shared study shell data through the dedicated module.')
assert.match(sharedLayout, /<NavBar\b/, 'Study layout should render the shared NavBar.')
assert.match(sharedLayout, /<StudyTabs\b/, 'Study layout should render the shared StudyTabs.')
assert.ok(
  !existsSync(join(studyRouteRoot, 'loading.tsx')),
  'Study route should not use a blocky route-level loading skeleton; keep tab transitions smooth and local.'
)

const pageFiles = [
  'page.tsx',
  'participants/page.tsx',
  'participants/[userId]/page.tsx',
  'analysis/page.tsx',
  'analysis/[questionId]/tag/page.tsx',
  'data/page.tsx',
  'edit/page.tsx',
  'preview/page.tsx',
]

for (const file of pageFiles) {
  const source = readFileSync(join(studyRouteRoot, file), 'utf8')
  assert.doesNotMatch(source, /<NavBar\b/, `${file} should use the shared study layout NavBar, not render its own.`)
  assert.doesNotMatch(source, /<StudyTabs\b/, `${file} should use the shared study layout tabs, not render its own.`)
  assert.doesNotMatch(source, /getSession\(/, `${file} should rely on the shared study layout for admin session checks.`)
}

const overviewData = readFileSync(join(root, 'app/lib/study-overview-data.ts'), 'utf8')
assert.match(overviewData, /loadStudyOverviewData/, 'Overview page should keep data loading behind loadStudyOverviewData.')

console.log('Study shell architecture checks passed.')
