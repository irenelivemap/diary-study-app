import 'dotenv/config'
import { spawn } from 'node:child_process'

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
const steps: Step[] = [
  { name: 'Participant action rules', command: npmCommand, args: ['run', 'qa:actions'] },
  { name: 'Seed QA fixtures', command: npmCommand, args: ['run', 'qa:seed'] },
  { name: 'Public smoke checks', command: npmCommand, args: ['run', 'smoke'], env: { QA_BASE_URL: baseUrl } },
  { name: 'Authenticated participant and admin flow', command: npmCommand, args: ['run', 'qa:flow'], env: { QA_BASE_URL: baseUrl } },
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

function formatDuration(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`
}

async function main() {
  console.log(`Running diARI QA against ${baseUrl}`)
  const results: StepResult[] = []

  for (const step of steps) {
    const result = await runStep(step)
    results.push(result)
    if (!result.ok) break
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
