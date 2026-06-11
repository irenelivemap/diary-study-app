import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()

const adminFiles = [
  'app/admin/page.tsx',
  'app/admin/studies/[id]/analysis/page.tsx',
  'app/admin/studies/[id]/data/page.tsx',
  'app/admin/studies/[id]/edit/page.tsx',
  'app/admin/studies/[id]/export/route.ts',
  'app/admin/studies/[id]/page.tsx',
  'app/admin/studies/[id]/participants/[userId]/page.tsx',
  'app/admin/studies/[id]/participants/page.tsx',
  'app/admin/studies/[id]/preview/page.tsx',
  'app/admin/studies/new/page.tsx',
]

for (const file of adminFiles) {
  const source = readFileSync(join(root, file), 'utf8')
  assert.match(
    source,
    /role\s*!==\s*['"]ADMIN['"]/,
    `${file} should explicitly check for ADMIN access.`
  )
}

const reminderRoute = readFileSync(join(root, 'app/api/reminders/run/route.ts'), 'utf8')
assert.match(reminderRoute, /CRON_SECRET/, 'Reminder cron route should check CRON_SECRET.')
assert.match(reminderRoute, /Unauthorized/, 'Reminder cron route should reject unauthorized requests.')

console.log('Access audit passed.')
