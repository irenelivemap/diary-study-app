import 'dotenv/config'
import { ChildProcess, spawn } from 'node:child_process'

type Step = {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
}

type StepResult = {
  name: string
  ok: boolean
  durationMs: number
}

const baseUrl = process.env.QA_BASE_URL
  || process.env.SMOKE_BASE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || process.env.APP_URL
  || 'http://localhost:3000'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const isLocalBaseUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl)
const skipBrowserChecks = process.env.QA_SKIP_BROWSER === 'true'
const browserSteps: Step[] = skipBrowserChecks
  ? []
  : [{ name: 'Browser layout and interaction checks', command: npmCommand, args: ['run', 'test:e2e'], env: { QA_BASE_URL: baseUrl } }]
const steps: Step[] = [
  { name: 'Environment configuration', command: npmCommand, args: ['run', 'qa:env'] },
  { name: 'Access rules', command: npmCommand, args: ['run', 'qa:access'] },
  { name: 'Access audit', command: npmCommand, args: ['run', 'qa:access-audit'] },
  { name: 'Participant action rules', command: npmCommand, args: ['run', 'qa:actions'] },
  { name: 'Reminder link rules', command: npmCommand, args: ['run', 'qa:reminders'] },
  { name: 'Reminder delivery rules', command: npmCommand, args: ['run', 'qa:reminder-delivery'] },
  { name: 'Reminder diagnostic rules', command: npmCommand, args: ['run', 'qa:reminder-diagnostics'] },
  { name: 'Answer dataset rules', command: npmCommand, args: ['run', 'qa:dataset'] },
  { name: 'Upload cleanup rules', command: npmCommand, args: ['run', 'qa:uploads'] },
  { name: 'Retention and deletion policy', command: npmCommand, args: ['run', 'qa:retention'] },
  { name: 'Analysis and data documentation', command: npmCommand, args: ['run', 'qa:analysis-docs'] },
  { name: 'Invite flow rules', command: npmCommand, args: ['run', 'qa:invites'] },
  { name: 'Seed QA fixtures', command: npmCommand, args: ['run', 'qa:seed'] },
  { name: 'Public smoke checks', command: npmCommand, args: ['run', 'smoke'], env: { QA_BASE_URL: baseUrl } },
  { name: 'Authenticated participant and admin flow', command: npmCommand, args: ['run', 'qa:flow'], env: { QA_BASE_URL: baseUrl } },
  ...browserSteps,
]

function runStep(step: Step): Promise<StepResult> {
  const startedAt = Date.now()
  console.log(`\n--- ${step.name} ---`)

  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...step.env,
      },
    })

    child.on('close', (code) => {
      resolve({
        name: step.name,
        ok: code === 0,
        durationMs: Date.now() - startedAt,
      })
    })
  })
}

async function canReachBaseUrl() {
  try {
    const response = await fetch(baseUrl, { redirect: 'manual' })
    return response.status > 0
  } catch {
    return false
  }
}

async function waitForBaseUrl(timeoutMs = 120_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await canReachBaseUrl()) return
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`Timed out waiting for ${baseUrl}`)
}

async function ensureLocalServer(): Promise<ChildProcess | null> {
  if (!isLocalBaseUrl) return null
  if (await canReachBaseUrl()) {
    console.log(`Local server already running at ${baseUrl}`)
    return null
  }

  console.log(`Starting local dev server at ${baseUrl}`)
  const server = spawn(npmCommand, ['run', 'dev'], {
    stdio: 'inherit',
    env: process.env,
  })
  await waitForBaseUrl()
  return server
}

function formatDuration(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`
}

async function main() {
  console.log(`Running diARI QA against ${baseUrl}`)
  const server = await ensureLocalServer()
  const results: StepResult[] = []

  try {
    for (const step of steps) {
      const result = await runStep(step)
      results.push(result)
      if (!result.ok) break
    }
  } finally {
    server?.kill('SIGTERM')
  }

  console.log('\nQA summary\n')
  for (const result of results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name} (${formatDuration(result.durationMs)})`)
  }

  const failed = results.find((result) => !result.ok)
  if (failed) {
    console.error(`\nQA stopped at: ${failed.name}`)
    process.exit(1)
  }

  console.log('\nAll QA checks passed.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
