'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/db'
import { getSession } from '@/app/lib/session'
import { normalizeTimezone } from '@/app/lib/validation'

const OTHER_SENTINEL = '__OTHER__'
const MAX_TEXT_ANSWER_LENGTH = 10000
const MAX_SHORT_ANSWER_LENGTH = 1000

function localDate(timeZone?: string | null) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function isWithinPartWindow(part: { dueDate: Date | null; durationDays: number | null }, joinedAt: Date) {
  const now = new Date()
  if (part.dueDate && part.dueDate < now) return false
  if (!part.durationDays) return true
  const end = new Date(joinedAt)
  end.setDate(end.getDate() + part.durationDays)
  return now <= end
}

function isPartComplete(part: { targetEntries: number | null; entries: { id: string }[] }) {
  return !!part.targetEntries && part.entries.length >= part.targetEntries
}

function isJourneyStage(part: { flow?: string | null }) {
  return part.flow === 'JOURNEY_STAGE'
}

function submittedValues(formData: FormData, questionId: string) {
  return formData.getAll(`question_${questionId}`).map(String).map((value) => value.trim()).filter(Boolean)
}

function submittedValue(formData: FormData, questionId: string) {
  return String(formData.get(`question_${questionId}`) ?? '').trim()
}

function answerTooLong(value: string, limit = MAX_TEXT_ANSWER_LENGTH) {
  return value.length > limit
}

function includesOtherValue(value: string) {
  return value.startsWith('Other:') && value.replace(/^Other:\s*/, '').trim().length > 0
}

function answerMatchesCondition(sourceValue: string | undefined, expectedValue: string) {
  if (!sourceValue) return false
  try {
    const parsed = JSON.parse(sourceValue)
    if (Array.isArray(parsed)) return parsed.includes(expectedValue)
  } catch {}
  return sourceValue === expectedValue
}

async function requireAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')
  return session
}

export async function deleteEntryFromForm(formData: FormData) {
  await requireAdmin()
  const studyId = String(formData.get('studyId') ?? '')
  const entryId = String(formData.get('entryId') ?? '')
  if (!studyId || !entryId) redirect('/admin')

  const entry = await prisma.entry.findFirst({
    where: { id: entryId, studyId },
    select: { id: true, journeyId: true },
  })
  if (entry) {
    await prisma.entry.delete({ where: { id: entry.id } })
    if (entry.journeyId) {
      await prisma.journey.update({
        where: { id: entry.journeyId },
        data: { completedAt: null },
      })
    }
  }

  revalidatePath(`/admin/studies/${studyId}`)
  revalidatePath(`/admin/studies/${studyId}/data`)
  revalidatePath(`/admin/studies/${studyId}/analysis`)
  revalidatePath(`/admin/studies/${studyId}/participants`)
  redirect(`/admin/studies/${studyId}/data`)
}

export async function startJourney(formData: FormData) {
  const session = await getSession()
  if (!session) redirect('/login')

  const studyId = String(formData.get('studyId') ?? '')
  const forceNewJourney = String(formData.get('forceNewJourney') ?? '') === 'true'
  if (!studyId) redirect('/dashboard')

  const study = await prisma.study.findUnique({
    where: { id: studyId },
    select: {
      id: true,
      isActive: true,
      isArchived: true,
      journeyName: true,
      participants: { where: { userId: session.userId }, select: { consentedAt: true } },
      parts: { where: { isActive: true, flow: 'JOURNEY_STAGE' }, orderBy: { order: 'asc' }, select: { id: true } },
    },
  })
  if (!study || study.isArchived || !study.isActive) redirect('/dashboard')
  if (!study.participants[0]?.consentedAt || study.parts.length === 0) redirect('/dashboard')

  if (!forceNewJourney) {
    const existingJourney = await prisma.journey.findFirst({
      where: { studyId, userId: session.userId, completedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { entries: { select: { partId: true } } },
    })
    if (existingJourney) {
      const completedPartIds = new Set(existingJourney.entries.map((entry) => entry.partId))
      const nextPart = study.parts.find((part) => !completedPartIds.has(part.id))
      if (!nextPart) {
        await prisma.journey.update({
          where: { id: existingJourney.id },
          data: { completedAt: new Date() },
        })
      } else {
        redirect(`/entry/new?studyId=${study.id}&partId=${nextPart.id}&journeyId=${existingJourney.id}`)
      }
    }
  }

  const journeyCount = await prisma.journey.count({ where: { studyId, userId: session.userId } })
  const journey = await prisma.journey.create({
    data: {
      studyId,
      userId: session.userId,
      label: `${study.journeyName || 'Journey'} #${journeyCount + 1}`,
    },
  })

  redirect(`/entry/new?studyId=${study.id}&partId=${study.parts[0].id}&journeyId=${journey.id}`)
}

export async function submitEntry(prevState: unknown, formData: FormData) {
  const session = await getSession()
  if (!session) redirect('/login')

  const studyId = String(formData.get('studyId') ?? '')
  const partId = String(formData.get('partId') ?? '')
  const journeyId = String(formData.get('journeyId') ?? '').trim() || null
  const date = String(formData.get('date') ?? '')
  const timezone = normalizeTimezone(formData.get('timezone'))

  const part = await prisma.part.findFirst({
    where: { id: partId, studyId },
    include: {
      questions: { where: { type: { not: 'CONTENT' } }, orderBy: [{ page: 'asc' }, { order: 'asc' }] },
      study: {
        include: {
          participants: { where: { userId: session.userId }, select: { consentedAt: true, joinedAt: true } },
          parts: {
            orderBy: { order: 'asc' },
            include: { entries: { where: { userId: session.userId }, select: { id: true, date: true } } },
          },
          journeys: {
            where: { id: journeyId ?? '__no_journey__', userId: session.userId },
            include: { entries: { select: { id: true, partId: true } } },
          },
        },
      },
    },
  })

  if (!part || part.study.isArchived || !part.study.isActive || !part.isActive) {
    return { error: 'This entry is not available.' }
  }

  const participation = part.study.participants[0]
  if (!participation || !participation.consentedAt) {
    return { error: 'You need to join the study and accept consent before submitting entries.' }
  }

  const journey = journeyId ? part.study.journeys[0] : null
  if (isJourneyStage(part)) {
    if (!journey) return { error: 'Please start this journey from your dashboard.' }
    const activePartIds = part.study.parts.filter((candidate) => candidate.isActive && isJourneyStage(candidate)).map((candidate) => candidate.id)
    const completedPartIds = new Set(journey.entries.map((entry) => entry.partId))
    const existingStageEntry = journey.entries.find((entry) => entry.partId === partId)
    if (existingStageEntry) redirect(`/entry/${existingStageEntry.id}`)
    if (part.study.sequential) {
      const nextPartId = activePartIds.find((candidateId) => !completedPartIds.has(candidateId))
      if (nextPartId !== partId) return { error: 'Please complete the journey stages in order from your dashboard.' }
    }
  }

  const effectiveTimezone = timezone || 'Europe/Berlin'
  const today = localDate(effectiveTimezone)
  if (date !== today) {
    return { error: 'This entry link is no longer current. Please start a new entry from your dashboard.' }
  }

  if (!isWithinPartWindow(part, participation.joinedAt)) {
    return { error: 'This part is no longer accepting entries.' }
  }

  if (!isJourneyStage(part) && part.study.sequential) {
    const partIndex = part.study.parts.findIndex((candidate) => candidate.id === partId)
    const unlocked =
      partIndex === 0 ||
      part.unlockRule === 'IMMEDIATE' ||
      (part.unlockRule === 'MANUAL' && part.isActive) ||
      (part.unlockRule === 'DATE' && !!part.unlockAt && part.unlockAt <= new Date()) ||
      (part.unlockRule === 'AFTER_PREVIOUS_TARGET' && part.study.parts.slice(0, partIndex).every(isPartComplete))
    if (!unlocked) return { error: 'This part is not unlocked yet.' }
  }

  if (!isJourneyStage(part) && journeyId) {
    return { error: 'This entry is not part of a journey.' }
  }

  if (!isJourneyStage(part) && part.entryPolicy === 'ONCE_PER_DAY') {
    const existing = await prisma.entry.findFirst({
      where: { partId, userId: session.userId, date },
      select: { id: true },
    })
    if (existing) return { error: 'You already submitted an entry for today.' }
  }

  const answerByQuestion = new Map<string, string>()
  const shownQuestionIds = new Set<string>()

  for (const q of part.questions) {
    const wasShown = !q.showIfQuestionId || !q.showIfValue || answerMatchesCondition(answerByQuestion.get(q.showIfQuestionId), q.showIfValue)
    if (!wasShown) {
      answerByQuestion.set(q.id, '')
      continue
    }

    shownQuestionIds.add(q.id)
    const regularOptions = q.options.filter((option) => option !== OTHER_SENTINEL)
    const allowedOptions = new Set(regularOptions)
    const allowsOther = q.options.includes(OTHER_SENTINEL)

    if (q.type === 'MULTIPLE_CHOICE') {
      const uniqueValues = Array.from(new Set(submittedValues(formData, q.id)))
      if (uniqueValues.some((value) => answerTooLong(value, MAX_SHORT_ANSWER_LENGTH))) {
        return { error: 'One selected option is too long. Please reload and try again.' }
      }
      const invalid = uniqueValues.some((value) => !allowedOptions.has(value) && !(allowsOther && includesOtherValue(value)))
      if (invalid) return { error: 'One selected option is no longer valid. Please reload and try again.' }

      const min = q.min ?? (q.required ? 1 : 0)
      const max = q.max ?? Math.max(regularOptions.length, 1)
      if (uniqueValues.length < min) {
        return { error: `Please select at least ${min} option${min === 1 ? '' : 's'} for every required multiple-choice question.` }
      }
      if (uniqueValues.length > max) {
        return { error: `Please select no more than ${max} option${max === 1 ? '' : 's'} for each multiple-choice question.` }
      }
      answerByQuestion.set(q.id, JSON.stringify(uniqueValues))
      continue
    }

    const value = submittedValue(formData, q.id)
    if (q.required && !value) return { error: 'Please answer every required question.' }
    if (value && answerTooLong(value, q.type === 'FREE_TEXT' ? MAX_TEXT_ANSWER_LENGTH : MAX_SHORT_ANSWER_LENGTH)) {
      return { error: 'One answer is too long. Please shorten it and try again.' }
    }

    if (q.type === 'SINGLE_CHOICE' && value && !allowedOptions.has(value) && !(allowsOther && includesOtherValue(value))) {
      return { error: 'One selected option is no longer valid. Please reload and try again.' }
    }

    if (q.type === 'YES_NO' && value && !['Yes', 'No'].includes(value)) {
      return { error: 'One yes/no answer is no longer valid. Please reload and try again.' }
    }

    if (q.type === 'RATING' && value) {
      const numeric = Number(value)
      if (!Number.isFinite(numeric) || numeric < (q.min ?? 1) || numeric > (q.max ?? 7)) {
        return { error: 'One rating answer is outside the allowed scale.' }
      }
    }

    if (q.type === 'DATE_TIME' && value && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
      return { error: 'One date/time answer is not valid.' }
    }

    if (q.type === 'SCREENSHOT' && value && !/^https?:\/\//.test(value)) {
      return { error: 'One uploaded file is not valid.' }
    }

    answerByQuestion.set(q.id, value)
  }

  const entry = await prisma.entry.create({
    data: {
      studyId,
      partId,
      userId: session.userId,
      journeyId,
      date,
      timezone,
      answers: {
        create: part.questions.map((q) => {
          const wasShown = shownQuestionIds.has(q.id)
          return {
            questionId: q.id,
            wasShown,
            value: wasShown ? (answerByQuestion.get(q.id) ?? '') : 'N/A - not shown',
          }
        }),
      },
    },
  })

  if (journeyId) {
    const activeParts = part.study.parts.filter((candidate) => candidate.isActive && isJourneyStage(candidate))
    const journeyEntryCount = await prisma.entry.count({ where: { journeyId } })
    if (journeyEntryCount >= activeParts.length) {
      await prisma.journey.update({ where: { id: journeyId }, data: { completedAt: new Date() } })
    }
  }

  revalidatePath('/dashboard')
  redirect(`/entry/${entry.id}`)
}
