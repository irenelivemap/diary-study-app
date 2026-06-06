'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { sendDueReminders } from '@/app/lib/reminders'

async function requireAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')
}

export async function sendStudyRemindersNow(studyId: string) {
  await requireAdmin()
  const result = await sendDueReminders({ studyId, force: true })
  revalidatePath(`/admin/studies/${studyId}`)
  return result
}
