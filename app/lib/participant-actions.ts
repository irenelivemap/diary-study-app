/**
 * Contains helper logic for participant-facing study actions.
 */
import {
  canOpenEntryForm,
  isJourneyStage,
  resolveJourneyStageEntryState,
  resolveStandardPartEntryState,
  type EntryAvailability,
} from '@/app/lib/entry-state'
import { resolveStudyStatus } from '@/app/lib/study-lifecycle'
import type { StudyStatus } from '@prisma/client'

type EntryLike = {
  id?: string
  partId?: string
  date?: string
  submittedAt?: Date | string
  isPilot?: boolean
}

type PartLike = {
  id: string
  name: string
  instructions?: string | null
  flow?: string | null
  isActive: boolean
  entryPolicy?: string | null
  targetEntries?: number | null
  durationDays?: number | null
  dueDate?: Date | string | null
  unlockRule?: string | null
  unlockAt?: Date | string | null
  entries?: EntryLike[]
  _count?: { entries?: number; questions?: number }
}

type ParticipationLike = {
  joinedAt: Date | string
  consentedAt?: Date | string | null
}

type StudyLike = {
  id?: string
  isActive: boolean
  isArchived: boolean
  status?: StudyStatus | null
  sequential?: boolean
  parts: PartLike[]
  journeys?: JourneyLike[]
}

type JourneyLike = {
  id: string
  label?: string | null
  isPilot?: boolean
  completedAt?: Date | string | null
  entries: EntryLike[]
}

export function journeyArticle(name: string) {
  return /^[aeiou]/i.test(name.trim()) ? 'an' : 'a'
}

export function pluralizeJourneyName(name: string) {
  const words = name.trim().split(/\s+/)
  const last = words.pop() ?? 'journey'
  const pluralLast = /[^aeiou]y$/i.test(last)
    ? `${last.slice(0, -1)}ies`
    : /(s|x|z|ch|sh)$/i.test(last)
      ? `${last}es`
      : `${last}s`
  return [...words, pluralLast].join(' ')
}

export function partEntryCount(part: Pick<PartLike, 'entries' | '_count'>) {
  return part._count?.entries ?? part.entries?.length ?? 0
}

function participantVisibleEntries(study: Pick<StudyLike, 'status' | 'isActive' | 'isArchived'>, entries: EntryLike[]) {
  if (resolveStudyStatus(study) === 'PREPARATION') return entries
  return entries.filter((entry) => !entry.isPilot)
}

function partsWithParticipantVisibleEntries(study: StudyLike) {
  return study.parts.map((part) => ({
    ...part,
    entries: participantVisibleEntries(study, part.entries ?? []),
    _count: part.entries ? { ...part._count, entries: undefined } : part._count,
  }))
}

export function isPartTargetReached(part: Pick<PartLike, 'targetEntries' | 'entries' | '_count'>) {
  return part.targetEntries != null && partEntryCount(part) >= part.targetEntries
}

export function getPartDurationState(joinedAt: Date | string, today: string, durationDays: number | null | undefined) {
  if (!durationDays) return null
  const endDate = new Date(joinedAt)
  endDate.setDate(endDate.getDate() + durationDays)
  const todayDate = new Date(today)
  const daysLeft = Math.ceil((endDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
  return { endDate, daysLeft, ended: daysLeft <= 0 }
}

export function standardPartStatusText(
  part: Pick<PartLike, 'entryPolicy' | 'targetEntries'>,
  todayCount: number,
  entryCount: number,
  goalReached: boolean
) {
  if (part.entryPolicy === 'MULTIPLE_PER_DAY') {
    if (todayCount > 0) return `${todayCount} submitted today`
    if (part.targetEntries && !goalReached) return 'Ready to submit today'
    return 'Ready when something happens'
  }
  if (todayCount > 0) return "Today's entry submitted"
  if (goalReached) return 'Completed'
  if (part.targetEntries) return `${Math.max(part.targetEntries - entryCount, 0)} left`
  return 'Ready to submit'
}

export function isSequentialPartUnlocked(study: Pick<StudyLike, 'sequential' | 'parts'>, index: number, now = new Date()) {
  if (!study.sequential || index === 0) return true
  const part = study.parts[index]
  const rule = part.unlockRule ?? 'AFTER_PREVIOUS_TARGET'
  if (rule === 'IMMEDIATE') return true
  if (rule === 'MANUAL') return part.isActive
  if (rule === 'DATE') return !!part.unlockAt && new Date(part.unlockAt) <= now
  return study.parts.slice(0, index).every((previous) => isPartTargetReached(previous))
}

export function resolveStandardParticipantAction({
  study,
  part,
  partIndex,
  participation,
  today,
  now = new Date(),
}: {
  study: StudyLike
  part: PartLike
  partIndex: number
  participation: ParticipationLike
  today: string
  now?: Date
}) {
  const visibleParts = partsWithParticipantVisibleEntries(study)
  const visiblePartFromStudy = visibleParts[partIndex]
  const sourceEntries = part.entries ?? visiblePartFromStudy?.entries ?? []
  const visiblePart = {
    ...visiblePartFromStudy,
    ...part,
    entries: participantVisibleEntries(study, sourceEntries),
    _count: sourceEntries.length > 0 ? { ...part._count, entries: undefined } : (part._count ?? visiblePartFromStudy?._count),
  }
  const progressParts = [...visibleParts]
  progressParts[partIndex] = visiblePart
  const entries = visiblePart.entries ?? []
  const todayEntries = entries.filter((entry) => entry.date === today)
  const todayEntry = todayEntries[0]
  const pastEntries = entries.filter((entry) => entry.date !== today)
  const entryCount = partEntryCount(visiblePart)
  const goalReached = isPartTargetReached(visiblePart)
  const allowMultipleEntries = part.entryPolicy === 'MULTIPLE_PER_DAY'
  const progressStudy = { ...study, parts: progressParts }
  const lockedBySequence = !isSequentialPartUnlocked(progressStudy, partIndex, now)
  const prevPartName = lockedBySequence
    ? visibleParts.slice(0, partIndex).reverse().find((candidate) => !isPartTargetReached(candidate))?.name
    : null

  const entryState = lockedBySequence
    ? ({ state: 'LOCKED', reason: 'strict-previous-stage-required', recommended: false } satisfies EntryAvailability)
    : resolveStandardPartEntryState({
      study: progressStudy,
      part,
      participation,
      entries,
      today,
      now,
      recommended: !todayEntry && !goalReached,
    })

  const durationState = getPartDurationState(participation.joinedAt, today, part.durationDays)
  const isOverdue = !!part.dueDate && new Date(part.dueDate) < now
  const targetLabel = part.targetEntries ? `${entryCount}/${part.targetEntries} entries` : `${entryCount} submitted`
  const timeLabel = isOverdue
    ? 'Deadline passed'
    : durationState?.ended
      ? `Ended ${durationState.endDate.toLocaleDateString()}`
      : durationState
        ? durationState.daysLeft === 1
          ? 'Last day today'
          : `${durationState.daysLeft} days left`
        : part.dueDate
          ? `Due ${new Date(part.dueDate).toLocaleDateString()}`
          : null

  return {
    allowMultipleEntries,
    canSubmit: canOpenEntryForm(entryState.state),
    currentStatus: standardPartStatusText(part, todayEntries.length, entryCount, goalReached),
    durationState,
    entryCount,
    entryState,
    goalReached,
    isClosed: entryState.state === 'CLOSED' || entryState.state === 'HIDDEN',
    isOverdue,
    lockedBySequence,
    pastEntries,
    prevPartName,
    target: part.targetEntries,
    targetLabel,
    timeLabel,
    todayEntries,
    todayEntry,
  }
}

export function activeJourneyStages<T extends { isActive: boolean; flow?: string | null }>(study: { parts: T[] }) {
  return study.parts.filter((part) => part.isActive && isJourneyStage(part))
}

export function splitParticipantJourneys<T extends JourneyLike>(study: { journeys?: T[] }) {
  const lifecycleStudy = study as Pick<StudyLike, 'status' | 'isActive' | 'isArchived'>
  const showPilot = resolveStudyStatus(lifecycleStudy) === 'PREPARATION'
  const journeys = (study.journeys ?? [])
    .filter((journey) => showPilot || !journey.isPilot)
    .map((journey) => ({
      ...journey,
      entries: participantVisibleEntries(lifecycleStudy, journey.entries),
    }))
  const openJourney = journeys.find((journey) => !journey.completedAt) ?? null
  const otherOpenJourneys = journeys.filter((journey) => !journey.completedAt && journey.id !== openJourney?.id)
  const startedOtherOpenJourneys = otherOpenJourneys.filter((journey) => journey.entries.length > 0)
  const completedJourneys = journeys.filter((journey) => journey.completedAt)
  return {
    completedJourneys,
    openJourney,
    previousJourneys: [...startedOtherOpenJourneys, ...completedJourneys],
    startedOtherOpenJourneys,
  }
}

export function resolveJourneyNextStage<T extends PartLike>(activeStages: T[], journey: JourneyLike) {
  const entriesByPart = new Map(journey.entries.map((entry) => [entry.partId, entry]))
  const stage = activeStages.find((candidate) => !entriesByPart.has(candidate.id))
  if (!stage) return null

  const stageIndex = activeStages.findIndex((candidate) => candidate.id === stage.id)
  const latestSubmittedIndex = activeStages.reduce((latest, candidate, index) => {
    return entriesByPart.has(candidate.id) ? Math.max(latest, index) : latest
  }, -1)

  return {
    isMissingEarlierStage: stageIndex < latestSubmittedIndex,
    stage,
  }
}

export function resolveJourneyStageParticipantAction({
  study,
  stage,
  activeStages,
  participation,
  journey,
  strictOrder,
}: {
  study: StudyLike
  stage: PartLike
  activeStages: PartLike[]
  participation: ParticipationLike
  journey: JourneyLike
  strictOrder: boolean
}) {
  const entry = journey.entries.find((candidate) => candidate.partId === stage.id)
  const entryState = resolveJourneyStageEntryState({
    study,
    stage,
    activeStages,
    participation,
    journeyEntries: journey.entries,
    strictOrder,
  })

  return {
    canAnswer: canOpenEntryForm(entryState.state),
    entry,
    entryState,
    isClosed: entryState.state === 'CLOSED',
    isLocked: entryState.state === 'LOCKED',
    isRecommended: entryState.state === 'RECOMMENDED',
    isSubmitted: entryState.state === 'SUBMITTED',
  }
}

export function countPendingParticipantActions({
  participations,
  today,
  now = new Date(),
}: {
  participations: Array<{ joinedAt: Date | string; consentedAt?: Date | string | null; study: StudyLike }>
  today: string
  now?: Date
}) {
  return participations.reduce((count, { study, joinedAt, consentedAt }) => {
    if (!consentedAt) return count
    const studyStatus = resolveStudyStatus(study)
    if (studyStatus !== 'PREPARATION' && studyStatus !== 'ACTIVE') return count

    const journeyPending = activeJourneyStages(study).length > 0 && !!splitParticipantJourneys(study).openJourney ? 1 : 0
    const standardPending = study.parts.filter((part, partIndex) => {
      if (isJourneyStage(part)) return false
      const action = resolveStandardParticipantAction({
        study,
        part,
        partIndex,
        participation: { joinedAt, consentedAt },
        today,
        now,
      })
      if (!action.canSubmit) return false
      if (part.entryPolicy === 'MULTIPLE_PER_DAY' && !part.targetEntries) return false
      return !action.goalReached || part.entryPolicy === 'ONCE_PER_DAY'
    }).length

    return count + journeyPending + standardPending
  }, 0)
}
