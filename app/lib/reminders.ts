import { prisma } from '@/app/lib/db'
import { appBaseUrl, emailFrom, htmlEscape, resendClient } from '@/app/lib/email'
import { normalizeTimezone } from '@/app/lib/validation'
import { canOpenEntryForm, isJourneyStage, resolveJourneyStageEntryState, resolveStandardPartEntryState } from '@/app/lib/entry-state'

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
      journeys: {
        orderBy: { createdAt: 'desc' },
        include: { entries: { select: { id: true, partId: true, date: true, submittedAt: true } } },
      },
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

function reminderEntryUrl(appUrl: string, studyId: string, partId: string, journeyId?: string | null) {
  const url = `${appUrl.replace(/\/$/, '')}/entry/new?studyId=${studyId}&partId=${partId}`
  return journeyId ? `${url}&journeyId=${journeyId}` : url
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
  const from = emailFrom()
  const appUrl = appBaseUrl()
  const result: ReminderResult = { configured: !!apiKey, checked: 0, sent: 0, skipped: 0, failed: 0, errors: [], skippedByReason: {} }

  const studies = await getReminderStudies(options.studyId)
  if (!apiKey) return result

  const resend = resendClient()
  if (!resend) return result

  for (const study of studies) {
    const entries = await prisma.entry.findMany({
      where: { studyId: study.id },
      select: { id: true, partId: true, userId: true, date: true, submittedAt: true },
    })
    const countByPartUser = new Map<string, number>()
    const entriesByPartUserDate = new Set<string>()

    for (const entry of entries) {
      const key = entryKey(entry.partId, entry.userId)
      countByPartUser.set(key, (countByPartUser.get(key) ?? 0) + 1)
      entriesByPartUserDate.add(entryDateKey(entry.partId, entry.userId, entry.date))
    }

    for (const participant of study.participants) {
      const timeZone = normalizeTimezone(participant.user.timezone) || 'Europe/Berlin'
      const today = localDate(timeZone)
      const reminderDays = study.reminderDays.length > 0 ? study.reminderDays : ['0', '1', '2', '3', '4', '5', '6']
      const activePartCount = Math.max(study.parts.filter((part) => part.isActive).length, 1)
      if (!reminderDays.includes(localDayOfWeek(timeZone))) {
        addSkip(result, 'not scheduled today', activePartCount)
        continue
      }
      if (!options.force && !timeReached(study.reminderTime, timeZone)) {
        addSkip(result, 'before reminder time', activePartCount)
        continue
      }

      const participantEntries = entries.filter((entry) => entry.userId === participant.user.id)
      const journeyStages = study.parts.filter((part) => part.isActive && isJourneyStage(part))
      const candidateReminders: Array<{ part: ReminderPart; entryUrl: string }> = []

      if (journeyStages.length > 0) {
        const openJourney = study.journeys.find((journey) => journey.userId === participant.user.id && !journey.completedAt)
        if (!openJourney) {
          addSkip(result, 'no open journey', Math.max(journeyStages.length, 1))
        } else {
          for (const part of journeyStages) {
            result.checked += 1
            const entryState = resolveJourneyStageEntryState({
              study,
              stage: part,
              activeStages: journeyStages,
              participation: participant,
              journeyEntries: openJourney.entries,
              strictOrder: study.sequential,
            })
            if (entryState.state !== 'RECOMMENDED') {
              addSkip(result, entryState.reason)
              continue
            }
            candidateReminders.push({
              part,
              entryUrl: reminderEntryUrl(appUrl, study.id, part.id, openJourney.id),
            })
            break
          }
        }
      }

      if (candidateReminders.length === 0) {
        for (const [partIndex, part] of study.parts.entries()) {
          if (isJourneyStage(part)) continue
          result.checked += 1
          if (!isPartUnlocked(study, part, partIndex, participant, countByPartUser)) {
            addSkip(result, 'part locked')
            continue
          }
          if (isPartComplete(part, participant.user.id, countByPartUser)) {
            addSkip(result, 'target complete')
            continue
          }
          const partEntries = participantEntries.filter((entry) => entry.partId === part.id)
          const entryState = resolveStandardPartEntryState({
            study,
            part,
            participation: participant,
            entries: partEntries,
            today,
            recommended: true,
          })
          if (!canOpenEntryForm(entryState.state)) {
            addSkip(result, entryState.reason)
            continue
          }
          if (entriesByPartUserDate.has(entryDateKey(part.id, participant.user.id, today)) && part.entryPolicy === 'ONCE_PER_DAY') {
            addSkip(result, 'already submitted today')
            continue
          }
          candidateReminders.push({
            part,
            entryUrl: reminderEntryUrl(appUrl, study.id, part.id),
          })
          break
        }
      }

      if (candidateReminders.length === 0) continue
      const { part, entryUrl } = candidateReminders[0]

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

  return result
}
