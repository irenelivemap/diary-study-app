type SmokeResult = {
  name: string
  ok: boolean
  detail: string
}

export {}

const rawBaseUrl = process.env.SMOKE_BASE_URL
  || process.env.QA_BASE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || process.env.APP_URL
  || 'http://localhost:3000'

const baseUrl = normalizeUrl(rawBaseUrl)
const inviteUrl = process.env.SMOKE_INVITE_URL ? normalizeSmokeUrl(process.env.SMOKE_INVITE_URL) : null
const results: SmokeResult[] = []

function normalizeUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return 'http://localhost:3000'
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function normalizeSmokeUrl(value: string) {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `${baseUrl}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`
}

function pathUrl(path: string) {
  return `${baseUrl}${path}`
}

async function record(name: string, run: () => Promise<string>) {
  try {
    const detail = await run()
    results.push({ name, ok: true, detail })
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : 'Unknown failure',
    })
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function fetchText(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const text = await response.text()
  return { response, text }
}

function locationPath(response: Response) {
  const location = response.headers.get('location')
  if (!location) return null
  try {
    return new URL(location, baseUrl).pathname
  } catch {
    return location
  }
}

async function main() {
  await record('Login page loads', async () => {
    const { response, text } = await fetchText(pathUrl('/login'))
    assert(response.ok, `Expected /login to load, got ${response.status}`)
    assert(/_next\/static|diARI|Welcome back/i.test(text), 'Login page did not return the app shell')
    return `${response.status} ${response.statusText}`
  })

  await record('Signup page loads', async () => {
    const { response, text } = await fetchText(pathUrl('/signup'))
    assert(response.ok, `Expected /signup to load, got ${response.status}`)
    assert(/create|participant|account/i.test(text), 'Signup page did not look like the signup page')
    return `${response.status} ${response.statusText}`
  })

  await record('Participant dashboard requires login', async () => {
    const response = await fetch(pathUrl('/dashboard'), { redirect: 'manual' })
    const redirectPath = locationPath(response)
    assert([301, 302, 303, 307, 308].includes(response.status), `Expected redirect, got ${response.status}`)
    assert(redirectPath === '/login', `Expected redirect to /login, got ${redirectPath ?? 'no location'}`)
    return `${response.status} -> ${redirectPath}`
  })

  await record('Researcher admin requires login', async () => {
    const response = await fetch(pathUrl('/admin'), { redirect: 'manual' })
    const redirectPath = locationPath(response)
    assert([301, 302, 303, 307, 308].includes(response.status), `Expected redirect, got ${response.status}`)
    assert(redirectPath === '/login', `Expected redirect to /login, got ${redirectPath ?? 'no location'}`)
    return `${response.status} -> ${redirectPath}`
  })

  await record('Reminder endpoint is protected', async () => {
    const { response, text } = await fetchText(pathUrl('/api/reminders/run'))
    assert(response.status === 401 || response.status === 503, `Expected 401/503 protection response, got ${response.status}`)
    assert(/unauthorized|configured/i.test(text), 'Reminder endpoint did not return the expected protection response')
    return `${response.status} ${response.statusText}`
  })

  await record('Upload endpoint requires login', async () => {
    const formData = new FormData()
    formData.append('context', 'entry-answer')
    const { response, text } = await fetchText(pathUrl('/api/upload'), { method: 'POST', body: formData })
    assert(response.status === 401, `Expected 401, got ${response.status}`)
    assert(/unauthorized/i.test(text), 'Upload endpoint did not reject unauthenticated requests')
    return `${response.status} ${response.statusText}`
  })

  if (inviteUrl) {
    await record('Invite link loads', async () => {
      const { response, text } = await fetchText(inviteUrl)
      assert(response.ok, `Expected invite link to load, got ${response.status}`)
      assert(/study invite|sign in to join|create participant account/i.test(text), 'Invite link did not look like a study invite')
      return `${response.status} ${response.statusText}`
    })
  }

  console.log(`\nSmoke checks for ${baseUrl}\n`)

  for (const result of results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`)
    console.log(`     ${result.detail}`)
  }

  const failed = results.filter((result) => !result.ok)
  if (failed.length > 0) {
    console.error(`\n${failed.length} smoke check${failed.length === 1 ? '' : 's'} failed.`)
    process.exit(1)
  }

  console.log('\nAll smoke checks passed.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
