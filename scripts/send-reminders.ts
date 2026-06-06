import 'dotenv/config'
import { sendDueReminders } from '../app/lib/reminders'

async function main() {
  const force = process.argv.includes('--force')
  const studyArg = process.argv.find((arg) => arg.startsWith('--study='))
  const studyId = studyArg?.split('=')[1]

  const result = await sendDueReminders({ studyId, force })
  console.log(JSON.stringify(result, null, 2))

  if (!result.configured) {
    console.error('Missing RESEND_API_KEY. Add it to .env before sending reminders.')
    process.exitCode = 1
  }
  if (result.failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
