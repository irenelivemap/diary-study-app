'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Resend } from 'resend'
import { getSession } from '@/app/lib/session'
import { sendDueReminders } from '@/app/lib/reminders'

async function requireAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')
  return session
}

export async function sendStudyRemindersNow(studyId: string) {
  await requireAdmin()
  const result = await sendDueReminders({ studyId, force: true })
  revalidatePath(`/admin/studies/${studyId}`)
  return result
}

export async function sendReminderTestEmail() {
  const session = await requireAdmin()
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'diARI <onboarding@resend.dev>'
  if (!apiKey) return { configured: false, sent: false, error: 'RESEND_API_KEY is not configured.' }

  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from,
      to: session.email,
      subject: 'diARI reminder test',
      html: `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
          <h1 style="font-size: 20px;">diARI reminder test</h1>
          <p>If you received this email, Resend is connected to your deployed app.</p>
        </div>
      `,
      text: 'diARI reminder test. If you received this email, Resend is connected to your deployed app.',
    })
    return { configured: true, sent: true, error: null }
  } catch (error) {
    return {
      configured: true,
      sent: false,
      error: error instanceof Error ? error.message : 'Unknown email error.',
    }
  }
}
