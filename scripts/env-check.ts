import 'dotenv/config'

type Check = {
  name: string
  ok: boolean
  severity: 'required' | 'recommended'
  detail: string
}

const productionMode = process.env.CHECK_PRODUCTION_ENV === 'true'

function hasValue(name: string) {
  return Boolean(process.env[name]?.trim())
}

function appUrlConfigured() {
  return hasValue('NEXT_PUBLIC_APP_URL')
    || hasValue('APP_URL')
    || hasValue('VERCEL_PROJECT_PRODUCTION_URL')
    || hasValue('VERCEL_URL')
}

function explicitAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || ''
}

function stablePublicAppUrlConfigured() {
  const value = explicitAppUrl()
  if (!value) return false
  try {
    const hostname = new URL(value).hostname
    return !hostname.includes('-git-') && !hostname.endsWith('-livemap-ag.vercel.app')
  } catch {
    return false
  }
}

function check(name: string, ok: boolean, severity: Check['severity'], detail: string): Check {
  return { name, ok, severity, detail }
}

const checks: Check[] = [
  check(
    'DATABASE_URL',
    hasValue('DATABASE_URL'),
    'required',
    'Needed for Prisma and all study data.'
  ),
  check(
    'SESSION_SECRET',
    (process.env.SESSION_SECRET?.length ?? 0) >= 32,
    'required',
    'Needed for secure login sessions. Use at least 32 characters.'
  ),
  check(
    'Public app URL',
    appUrlConfigured(),
    productionMode ? 'required' : 'recommended',
    'Needed for invite links and reminder links. Prefer NEXT_PUBLIC_APP_URL in production.'
  ),
  check(
    'Stable participant URL',
    stablePublicAppUrlConfigured(),
    productionMode ? 'required' : 'recommended',
    'NEXT_PUBLIC_APP_URL or APP_URL should be the stable production domain, not a Vercel preview/deployment URL.'
  ),
  check(
    'RESEND_API_KEY',
    hasValue('RESEND_API_KEY'),
    'recommended',
    'Needed to send invitations, reminders, and removal emails.'
  ),
  check(
    'EMAIL_FROM',
    hasValue('EMAIL_FROM'),
    'recommended',
    'Needed to send email from the right verified sender.'
  ),
  check(
    'CRON_SECRET',
    hasValue('CRON_SECRET'),
    'recommended',
    'Needed to protect the reminder cron endpoint.'
  ),
  check(
    'BLOB_READ_WRITE_TOKEN',
    hasValue('BLOB_READ_WRITE_TOKEN'),
    'recommended',
    'Needed for participant screenshot/image uploads in Vercel Blob.'
  ),
]

const failed = checks.filter((item) => !item.ok && item.severity === 'required')
const warnings = checks.filter((item) => !item.ok && item.severity === 'recommended')

console.log('\ndiARI environment check\n')
for (const item of checks) {
  const label = item.ok ? 'PASS' : item.severity === 'required' ? 'FAIL' : 'WARN'
  console.log(`${label} ${item.name}`)
  console.log(`     ${item.detail}`)
}

if (warnings.length > 0) {
  console.log(`\n${warnings.length} recommended production setting${warnings.length === 1 ? '' : 's'} missing.`)
}

if (failed.length > 0) {
  console.error(`\n${failed.length} required setting${failed.length === 1 ? '' : 's'} missing.`)
  process.exit(1)
}

console.log('\nRequired environment settings look OK.')
