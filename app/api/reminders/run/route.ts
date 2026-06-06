import { NextResponse } from 'next/server'
import { sendDueReminders } from '@/app/lib/reminders'

async function runReminders(request: Request) {
  const configuredSecret = process.env.CRON_SECRET
  const requestSecret = request.headers.get('authorization')?.replace('Bearer ', '')

  if (!configuredSecret) {
    return NextResponse.json({ error: 'Reminder cron is not configured.' }, { status: 503 })
  }

  if (requestSecret !== configuredSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await sendDueReminders()
  return NextResponse.json(result)
}

export async function GET(request: Request) {
  return runReminders(request)
}

export async function POST(request: Request) {
  return runReminders(request)
}
