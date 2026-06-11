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

const uploadRoute = readFileSync(join(root, 'app/api/upload/route.ts'), 'utf8')
assert.match(uploadRoute, /access\s*=\s*['"]private['"]/, 'Participant entry uploads should use private Blob access.')

const uploadFileRoute = readFileSync(join(root, 'app/api/upload/file/route.ts'), 'utf8')
assert.match(uploadFileRoute, /getSession/, 'Private upload file route should require a session.')
assert.match(uploadFileRoute, /session\.role\s*!==\s*['"]ADMIN['"]/, 'Private upload file route should distinguish admin access.')
assert.match(uploadFileRoute, /session\.userId\s*!==\s*upload\.userId/, 'Private upload file route should restrict participant access to their own uploads.')

const studyActions = readFileSync(join(root, 'app/actions/studies.ts'), 'utf8')
assert.match(studyActions, /ensureInviteLink[\s\S]*acceptsParticipantEntries/, 'Invite link creation should be blocked for closed or archived studies.')
assert.match(studyActions, /addParticipant[\s\S]*acceptsParticipantEntries/, 'Participant invitations should be blocked for closed or archived studies.')

console.log('Access audit passed.')
