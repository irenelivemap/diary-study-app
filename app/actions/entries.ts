'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/db'
import { getSession } from '@/app/lib/session'
import { normalizeTimezone } from '@/app/lib/validation'
import { canOpenEntryForm, type EntryQualityFlag, isJourneyStage, resolveJourneyStageEntryState, resolveStandardPartEntryState } from '@/app/lib/entry-state'
import { isPilotSubmission } from '@/app/lib/study-lifecycle'

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

function isPartComplete(part: { targetEntries: number | null; entries: { id: string }[] }) {
  return !!part.targetEntries && part.entries.length >= part.targetEntries
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

function addQualityFlag(flags: Set<EntryQualityFlag>, flag: EntryQualityFlag) {
  flags.add(flag)
}

function answerIndicatesRetrospection(value: string, today: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}$/)
  return !!match && match[1] < today
}

function isValidUploadedFileValue(value: string) {
  return /^https?:\/\//.test(value) || value.startsWith('/api/upload/file?')
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
      status: true,
      journeyName: true,
      participants: { where: { userId: session.userId }, select: { consentedAt: true } },
      parts: { where: { isActive: true, flow: 'JOURNEY_STAGE' }, orderBy: { order: 'asc' }, select: { id: true } },
    },
  })
  if (!study || study.isArchived || !study.isActive) redirect('/dashboard')
  if (!study.participants[0]?.consentedAt || study.parts.length === 0) redirect('/dashboard')

  if (!forceNewJourney) {
    const existingJourney = await prisma.journey.findFirst({
      where: {
        studyId,
        userId: session.userId,
        completedAt: null,
        ...(isPilotSubmission(study) ? {} : { isPilot: false }),
      },
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
      isPilot: isPilotSubmission(study),
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
            include: { entries: { where: { userId: session.userId }, select: { id: true, date: true, isPilot: true } } },
          },
          journeys: {
            where: { id: journeyId ?? '__no_journey__', userId: session.userId },
            include: { entries: { select: { id: true, partId: true, isPilot: true } } },
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
  const showPilotEntries = isPilotSubmission(part.study)
  const visibleStudyParts = part.study.parts.map((studyPart) => ({
    ...studyPart,
    entries: showPilotEntries ? studyPart.entries : studyPart.entries.filter((entry) => !entry.isPilot),
  }))
  const visibleJourneyEntries = journey
    ? showPilotEntries ? journey.entries : journey.entries.filter((entry) => !entry.isPilot)
    : []

  if (isJourneyStage(part)) {
    if (!journey) return { error: 'Please start this journey from your dashboard.' }
    if (!showPilotEntries && journey.isPilot) return { error: 'This test journey is no longer available. Please start from your dashboard.' }
    const activePartIds = part.study.parts.filter((candidate) => candidate.isActive && isJourneyStage(candidate)).map((candidate) => candidate.id)
    const existingStageEntry = visibleJourneyEntries.find((entry) => entry.partId === partId)
    if (existingStageEntry) redirect(`/entry/${existingStageEntry.id}`)
    const activeStages = part.study.parts.filter((candidate) => activePartIds.includes(candidate.id))
    const entryState = resolveJourneyStageEntryState({
      study: part.study,
      stage: part,
      activeStages,
      participation,
      journeyEntries: visibleJourneyEntries,
      strictOrder: part.study.sequential,
    })
    if (!canOpenEntryForm(entryState.state)) {
      return { error: 'This journey stage is not available right now. Please return to your dashboard.' }
    }
  }

  const effectiveTimezone = timezone || 'Europe/Berlin'
  const today = localDate(effectiveTimezone)
  if (date !== today) {
    return { error: 'This entry link is no longer current. Please start a new entry from your dashboard.' }
  }

  if (!isJourneyStage(part) && part.study.sequential) {
    const partIndex = part.study.parts.findIndex((candidate) => candidate.id === partId)
    const unlocked =
      partIndex === 0 ||
      part.unlockRule === 'IMMEDIATE' ||
      (part.unlockRule === 'MANUAL' && part.isActive) ||
      (part.unlockRule === 'DATE' && !!part.unlockAt && part.unlockAt <= new Date()) ||
      (part.unlockRule === 'AFTER_PREVIOUS_TARGET' && visibleStudyParts.slice(0, partIndex).every(isPartComplete))
    if (!unlocked) return { error: 'This part is not unlocked yet.' }
  }

  if (!isJourneyStage(part) && journeyId) {
    return { error: 'This entry is not part of a journey.' }
  }

  if (!isJourneyStage(part)) {
    const currentPart = visibleStudyParts.find((candidate) => candidate.id === part.id)
    const entryState = resolveStandardPartEntryState({
      study: part.study,
      part,
      participation,
      entries: currentPart?.entries ?? [],
      today,
      recommended: true,
    })
    if (entryState.state === 'SUBMITTED' && entryState.existingEntryId) redirect(`/entry/${entryState.existingEntryId}`)
    if (!canOpenEntryForm(entryState.state)) {
      return { error: 'This part is not accepting entries right now.' }
    }
  }

  const answerByQuestion = new Map<string, string>()
  const shownQuestionIds = new Set<string>()
  const qualityFlags = new Set<EntryQualityFlag>()

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
    if (q.type === 'DATE_TIME' && value && answerIndicatesRetrospection(value, today)) {
      addQualityFlag(qualityFlags, 'retrospective')
    }

    if (q.type === 'SCREENSHOT' && value && !isValidUploadedFileValue(value)) {
      return { error: 'One uploaded file is not valid.' }
    }

    answerByQuestion.set(q.id, value)
  }

  if (isJourneyStage(part) && journey) {
    const activeStages = part.study.parts.filter((candidate) => candidate.isActive && isJourneyStage(candidate))
    const submittedStageIds = new Set(visibleJourneyEntries.map((entry) => entry.partId))
    const currentStageIndex = activeStages.findIndex((stage) => stage.id === part.id)
    const hasMissingEarlierStage = currentStageIndex > 0 && activeStages
      .slice(0, currentStageIndex)
      .some((stage) => !submittedStageIds.has(stage.id))
    if (hasMissingEarlierStage) addQualityFlag(qualityFlags, 'out_of_order')
  }

  const closedDateReason =
    (part.dueDate && part.dueDate < new Date()) ||
    (part.durationDays && (() => {
      const end = new Date(participation.joinedAt)
      end.setDate(end.getDate() + part.durationDays)
      return end < new Date()
    })())
  if (closedDateReason) addQualityFlag(qualityFlags, 'late')

  const entry = await prisma.entry.create({
    data: {
      studyId,
      partId,
      userId: session.userId,
      journeyId,
      date,
      timezone,
      isPilot: isPilotSubmission(part.study),
      qualityFlags: Array.from(qualityFlags),
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
