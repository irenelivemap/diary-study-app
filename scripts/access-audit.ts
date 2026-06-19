import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()

const explicitAdminFiles = [
  'app/admin/page.tsx',
  'app/admin/studies/[id]/export/route.ts',
  'app/admin/studies/new/page.tsx',
]

for (const file of explicitAdminFiles) {
  const source = readFileSync(join(root, file), 'utf8')
  assert.match(
    source,
    /role\s*!==\s*['"]ADMIN['"]/,
    `${file} should explicitly check for ADMIN access.`
  )
}

const studyLayout = readFileSync(join(root, 'app/admin/studies/[id]/layout.tsx'), 'utf8')
assert.match(studyLayout, /getSession/, 'Study admin layout should require a session.')
assert.match(studyLayout, /role\s*!==\s*['"]ADMIN['"]/, 'Study admin layout should explicitly check for ADMIN access.')

const layoutProtectedAdminFiles = [
  'app/admin/studies/[id]/analysis/page.tsx',
  'app/admin/studies/[id]/data/page.tsx',
  'app/admin/studies/[id]/edit/page.tsx',
  'app/admin/studies/[id]/page.tsx',
  'app/admin/studies/[id]/participants/[userId]/page.tsx',
  'app/admin/studies/[id]/participants/page.tsx',
  'app/admin/studies/[id]/preview/page.tsx',
]

for (const file of layoutProtectedAdminFiles) {
  const source = readFileSync(join(root, file), 'utf8')
  assert.doesNotMatch(
    source,
    /<NavBar\b|<StudyTabs\b|getSession\(/,
    `${file} should rely on the protected study layout instead of recreating admin shell checks.`
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

const adminIndex = readFileSync(join(root, 'app/admin/page.tsx'), 'utf8')
assert.match(adminIndex, /status:\s*\{\s*not:\s*['"]ARCHIVED['"]\s*\}/, 'Current studies should exclude archived lifecycle status.')
assert.match(adminIndex, /OR:\s*\[[\s\S]*isArchived:\s*true[\s\S]*status:\s*['"]ARCHIVED['"][\s\S]*\]/, 'Past studies should include archived lifecycle status and archived legacy flag.')

const entryPage = readFileSync(join(root, 'app/entry/[id]/page.tsx'), 'utf8')
assert.match(entryPage, /entry\.study\.isArchived\s*\|\|\s*entry\.study\.status\s*===\s*['"]ARCHIVED['"]/, 'Participants should not be able to open archived study entries through old links.')

const journeyPage = readFileSync(join(root, 'app/journey/[id]/page.tsx'), 'utf8')
assert.match(journeyPage, /journey\.study\.isArchived\s*\|\|\s*journey\.study\.status\s*===\s*['"]ARCHIVED['"]/, 'Participants should not be able to open archived journeys through old links.')

const loginAction = readFileSync(join(root, 'app/actions/auth.ts'), 'utf8')
assert.match(loginAction, /checkLoginRateLimit/, 'Login should check rate limits before password verification.')
assert.match(loginAction, /recordFailedLogin/, 'Login should record failed attempts for invalid credentials.')
assert.match(loginAction, /clearLoginRateLimit/, 'Login should clear throttling records after successful sign-in.')

const teamActions = readFileSync(join(root, 'app/actions/team.ts'), 'utf8')
assert.match(teamActions, /role\s*!==\s*['"]ADMIN['"]/, 'Team access actions should require ADMIN access.')
assert.match(teamActions, /passwordResetToken\.create/, 'Admin invitations should use password setup tokens.')
assert.match(teamActions, /adminCount\s*<=\s*1/, 'Team access should prevent removing the last admin.')
assert.match(teamActions, /adminId\s*===\s*session\.userId/, 'Team access should prevent admins from removing themselves.')

const profilePage = readFileSync(join(root, 'app/profile/page.tsx'), 'utf8')
assert.match(profilePage, /profileMode\s*===\s*['"]ADMIN['"][\s\S]*TeamAccessSection/, 'Team access should only render in the admin profile mode.')

const loginRateLimit = readFileSync(join(root, 'app/lib/login-rate-limit.ts'), 'utf8')
assert.match(loginRateLimit, /x-forwarded-for/, 'Login rate limiting should include the client IP forwarded by the platform.')
assert.match(loginRateLimit, /MAX_FAILED_ATTEMPTS\s*=\s*5/, 'Login rate limiting should block repeated password guesses.')

const htmlSanitizer = readFileSync(join(root, 'app/lib/sanitize-html.ts'), 'utf8')
assert.match(htmlSanitizer, /sanitize-html/, 'Rich-text HTML should be sanitized by a maintained library.')
assert.match(htmlSanitizer, /allowedTags/, 'Rich-text HTML sanitizer should use an explicit allowlist.')
assert.match(htmlSanitizer, /allowedSchemes/, 'Rich-text HTML sanitizer should restrict link URL schemes.')

console.log('Access audit passed.')
