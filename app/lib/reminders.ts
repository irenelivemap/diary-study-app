import { Resend } from 'resend'
import { prisma } from '@/app/lib/db'

type ReminderResult = {
  configured: boolean
  checked: number
  sent: number
  skipped: number
  failed: number
  errors: string[]
  skippedByReason: Record<string, number>
}

type SendDueRemindersOptions = {
  studyId?: string
  force?: boolean
}

type StudyWithReminderData = Awaited<ReturnType<typeof getReminderStudies>>[number]
type ReminderPart = StudyWithReminderData['parts'][number]
type ReminderParticipant = StudyWithReminderData['participants'][number]

function getReminderStudies(studyId?: string) {
  return prisma.study.findMany({
    where: {
      ...(studyId ? { id: studyId } : {}),
      isActive: true,
      isArchived: false,
      remindersEnabled: true,
    },
    include: {
      parts: { orderBy: { order: 'asc' } },
      participants: {
        where: { consentedAt: { not: null } },
        include: { user: { select: { id: true, name: true, email: true, timezone: true } } },
        orderBy: { joinedAt: 'asc' },
      },
    },
  })
}

function localDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}

function localHourMinute(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hour}:${minute}`
}

function timeReached(reminderTime: string | null, timeZone: string) {
  return localHourMinute(timeZone) >= (reminderTime ?? '18:00')
}

function localDayOfWeek(timeZone: string) {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date())
  return { Sun: '0', Mon: '1', Tue: '2', Wed: '3', Thu: '4', Fri: '5', Sat: '6' }[weekday] ?? '1'
}

function addSkip(result: ReminderResult, reason: string, count = 1) {
  result.skipped += count
  result.skippedByReason[reason] = (result.skippedByReason[reason] ?? 0) + count
}

function htmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function entryKey(partId: string, userId: string) {
  return `${partId}:${userId}`
}

function entryDateKey(partId: string, userId: string, date: string) {
  return `${partId}:${userId}:${date}`
}

function isPartComplete(part: ReminderPart, userId: string, countByPartUser: Map<string, number>) {
  if (!part.targetEntries) return false
  return (countByPartUser.get(entryKey(part.id, userId)) ?? 0) >= part.targetEntries
}

function isPartUnlocked(
  study: StudyWithReminderData,
  part: ReminderPart,
  partIndex: number,
  participant: ReminderParticipant,
  countByPartUser: Map<string, number>
) {
  if (!part.isActive) return false
  if (!study.sequential || partIndex === 0) return true

  if (part.unlockRule === 'IMMEDIATE') return true
  if (part.unlockRule === 'MANUAL') return part.isActive
  if (part.unlockRule === 'DATE') return !!part.unlockAt && part.unlockAt <= new Date()

  return study.parts
    .slice(0, partIndex)
    .every((previous) => isPartComplete(previous, participant.user.id, countByPartUser))
}

function isWithinPartWindow(part: ReminderPart, participant: ReminderParticipant) {
  const now = new Date()
  if (part.dueDate && part.dueDate < now) return false

  if (!part.durationDays) return true
  const start = participant.joinedAt
  const end = new Date(start)
  end.setDate(end.getDate() + part.durationDays)
  return now <= end
}

function emailSubject(study: StudyWithReminderData, part: ReminderPart) {
  return study.reminderSubject?.trim() || `Reminder: ${part.name} in ${study.name}`
}

function emailHtml(study: StudyWithReminderData, part: ReminderPart, participant: ReminderParticipant, entryUrl: string) {
  const body = study.reminderBody?.trim()
    || study.reminderNote?.trim()
    || `Please complete today's diary entry when you have a moment.`
  const safeName = htmlEscape(participant.user.name || 'there')
  const safeStudy = htmlEscape(study.name)
  const safePart = htmlEscape(part.name)
  const safeBody = htmlEscape(body).replaceAll('\n', '<br />')
  const safeContact = study.contactEmail ? htmlEscape(study.contactEmail) : null

  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a; line-height: 1.55;">
      <p style="font-size: 14px; color: #64748b;">diARI study reminder</p>
      <h1 style="font-size: 22px; margin: 0 0 12px;">Hi ${safeName},</h1>
      <p>${safeBody}</p>
      <p><strong>Study:</strong> ${safeStudy}<br /><strong>Part:</strong> ${safePart}</p>
      <p style="margin: 28px 0;">
        <a href="${entryUrl}" style="background: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; display: inline-block;">
          Complete today's entry
        </a>
      </p>
      ${safeContact ? `<p style="font-size: 13px; color: #64748b;">Questions? Contact ${safeContact}.</p>` : ''}
    </div>
  `
}

function emailText(study: StudyWithReminderData, part: ReminderPart, participant: ReminderParticipant, entryUrl: string) {
  const body = study.reminderBody?.trim()
    || study.reminderNote?.trim()
    || `Please complete today's diary entry when you have a moment.`

  return [
    `Hi ${participant.user.name || 'there'},`,
    '',
    body,
    '',
    `Study: ${study.name}`,
    `Part: ${part.name}`,
    '',
    `Complete today's entry: ${entryUrl}`,
    study.contactEmail ? `Questions? Contact ${study.contactEmail}.` : '',
  ].filter(Boolean).join('\n')
}

export async function sendDueReminders(options: SendDueRemindersOptions = {}): Promise<ReminderResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'diARI <onboarding@resend.dev>'
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000')
  const result: ReminderResult = { configured: !!apiKey, checked: 0, sent: 0, skipped: 0, failed: 0, errors: [], skippedByReason: {} }

  const studies = await getReminderStudies(options.studyId)
  if (!apiKey) return result

  const resend = new Resend(apiKey)

  for (const study of studies) {
    const entries = await prisma.entry.findMany({
      where: { studyId: study.id },
      select: { partId: true, userId: true, date: true },
    })
    const countByPartUser = new Map<string, number>()
    const entriesByPartUserDate = new Set<string>()

    for (const entry of entries) {
      const key = entryKey(entry.partId, entry.userId)
      countByPartUser.set(key, (countByPartUser.get(key) ?? 0) + 1)
      entriesByPartUserDate.add(entryDateKey(entry.partId, entry.userId, entry.date))
    }

    for (const participant of study.participants) {
      const timeZone = participant.user.timezone || 'Europe/Berlin'
      const today = localDate(timeZone)
      const reminderDays = study.reminderDays.length > 0 ? study.reminderDays : ['0', '1', '2', '3', '4', '5', '6']
      if (!reminderDays.includes(localDayOfWeek(timeZone))) {
        addSkip(result, 'not scheduled today', study.parts.length)
        continue
      }
      if (!options.force && !timeReached(study.reminderTime, timeZone)) {
        addSkip(result, 'before reminder time', study.parts.length)
        continue
      }

      for (const [partIndex, part] of study.parts.entries()) {
        result.checked += 1
        if (!isPartUnlocked(study, part, partIndex, participant, countByPartUser)) {
          addSkip(result, 'part locked')
          continue
        }
        if (!isWithinPartWindow(part, participant)) {
          addSkip(result, 'outside part window')
          continue
        }
        if (isPartComplete(part, participant.user.id, countByPartUser)) {
          addSkip(result, 'target complete')
          continue
        }
        if (entriesByPartUserDate.has(entryDateKey(part.id, participant.user.id, today))) {
          addSkip(result, 'already submitted today')
          continue
        }

        const existing = await prisma.emailReminderLog.findUnique({
          where: {
            studyId_partId_userId_date_reminderType: {
              studyId: study.id,
              partId: part.id,
              userId: participant.user.id,
              date: today,
              reminderType: 'DAILY_ENTRY',
            },
          },
        })
        if (existing?.status === 'SENT') {
          addSkip(result, 'already reminded today')
          continue
        }

        const entryUrl = `${appUrl.replace(/\/$/, '')}/entry/new?studyId=${study.id}&partId=${part.id}`

        try {
          const response = await resend.emails.send({
            from,
            to: participant.user.email,
            subject: emailSubject(study, part),
            html: emailHtml(study, part, participant, entryUrl),
            text: emailText(study, part, participant, entryUrl),
          })

          await prisma.emailReminderLog.upsert({
            where: {
              studyId_partId_userId_date_reminderType: {
                studyId: study.id,
                partId: part.id,
                userId: participant.user.id,
                date: today,
                reminderType: 'DAILY_ENTRY',
              },
            },
            update: {
              status: 'SENT',
              providerId: response.data?.id,
              error: null,
              sentAt: new Date(),
            },
            create: {
              studyId: study.id,
              partId: part.id,
              userId: participant.user.id,
              date: today,
              status: 'SENT',
              providerId: response.data?.id,
            },
          })
          result.sent += 1
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown email error'
          await prisma.emailReminderLog.upsert({
            where: {
              studyId_partId_userId_date_reminderType: {
                studyId: study.id,
                partId: part.id,
                userId: participant.user.id,
                date: today,
                reminderType: 'DAILY_ENTRY',
              },
            },
            update: {
              status: 'FAILED',
              error: message,
              sentAt: new Date(),
            },
            create: {
              studyId: study.id,
              partId: part.id,
              userId: participant.user.id,
              date: today,
              status: 'FAILED',
              error: message,
            },
          }).catch(() => null)
          result.failed += 1
          result.errors.push(`${participant.user.email}: ${message}`)
        }
      }
    }
  }

  return result
}
