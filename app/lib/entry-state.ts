/**
 * Calculates whether participants can open, submit, or review diary entries.
 */
import { acceptsParticipantEntries } from '@/app/lib/study-lifecycle'

export type EntryAvailabilityState =
  | 'SUBMITTED'
  | 'RECOMMENDED'
  | 'AVAILABLE'
  | 'LOCKED'
  | 'CLOSED'
  | 'HIDDEN'

export type EntryAvailabilityReason =
  | 'already-submitted'
  | 'recommended-next'
  | 'available-if-needed'
  | 'study-closed'
  | 'participant-not-consented'
  | 'part-inactive'
  | 'daily-quota-reached'
  | 'part-window-ended'
  | 'part-due-date-passed'
  | 'strict-previous-stage-required'
  | 'standard-part-inside-journey'
  | 'journey-stage-needs-journey'
  | 'not-relevant'

export type EntryAvailability = {
  state: EntryAvailabilityState
  reason: EntryAvailabilityReason
  recommended: boolean
  existingEntryId?: string
}

export type EntryQualityFlag = 'late' | 'out_of_order' | 'retrospective'

type EntryLike = {
  id?: string
  partId?: string
  date?: string
  submittedAt?: Date | string
}

type PartLike = {
  id: string
  flow?: string | null
  isActive: boolean
  entryPolicy?: string | null
  targetEntries?: number | null
  durationDays?: number | null
  dueDate?: Date | string | null
}

type ParticipationLike = {
  joinedAt: Date | string
  consentedAt?: Date | string | null
}

type StudyLike = {
  status?: 'PREPARATION' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED' | null
  isActive: boolean
  isArchived: boolean
  sequential?: boolean
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

export function isJourneyStage(part: { flow?: string | null }) {
  return part.flow === 'JOURNEY_STAGE'
}

export function partEntryCount(part: { entries?: EntryLike[] }, fallback = 0) {
  return part.entries?.length ?? fallback
}

export function isTargetReached(part: { targetEntries?: number | null; entries?: EntryLike[] }, fallbackCount = 0) {
  return part.targetEntries != null && partEntryCount(part, fallbackCount) >= part.targetEntries
}

export function partWindowClosed(part: Pick<PartLike, 'dueDate' | 'durationDays'>, participation: Pick<ParticipationLike, 'joinedAt'>, now = new Date()) {
  const dueDate = asDate(part.dueDate)
  if (dueDate && dueDate < now) return 'part-due-date-passed' as const

  if (!part.durationDays) return null
  const joinedAt = asDate(participation.joinedAt)
  if (!joinedAt) return null
  const end = new Date(joinedAt)
  end.setDate(end.getDate() + part.durationDays)
  return end < now ? 'part-window-ended' as const : null
}

export function earliestUnsubmittedJourneyStage<T extends { id: string }>(stages: T[], journeyEntries: EntryLike[]) {
  const submittedPartIds = new Set(journeyEntries.map((entry) => entry.partId).filter(Boolean))
  return stages.find((stage) => !submittedPartIds.has(stage.id)) ?? null
}

export function resolveStandardPartEntryState({
  study,
  part,
  participation,
  entries,
  today,
  now = new Date(),
  recommended = false,
}: {
  study: StudyLike
  part: PartLike
  participation: ParticipationLike | null
  entries: EntryLike[]
  today: string
  now?: Date
  recommended?: boolean
}): EntryAvailability {
  if (isJourneyStage(part)) {
    return { state: 'HIDDEN', reason: 'not-relevant', recommended: false }
  }
  if (!acceptsParticipantEntries(study)) {
    return { state: 'CLOSED', reason: 'study-closed', recommended: false }
  }
  if (!participation?.consentedAt) {
    return { state: 'LOCKED', reason: 'participant-not-consented', recommended: false }
  }
  if (!part.isActive) {
    return { state: 'HIDDEN', reason: 'part-inactive', recommended: false }
  }

  const todayEntry = entries.find((entry) => entry.date === today)
  if (part.entryPolicy === 'ONCE_PER_DAY' && todayEntry?.id) {
    return { state: 'SUBMITTED', reason: 'daily-quota-reached', recommended: false, existingEntryId: todayEntry.id }
  }

  const closedReason = partWindowClosed(part, participation, now)
  if (closedReason) {
    return { state: 'CLOSED', reason: closedReason, recommended: false }
  }

  return {
    state: recommended ? 'RECOMMENDED' : 'AVAILABLE',
    reason: recommended ? 'recommended-next' : 'available-if-needed',
    recommended,
  }
}

export function resolveJourneyStageEntryState({
  study,
  stage,
  activeStages,
  participation,
  journeyEntries,
  now = new Date(),
  strictOrder = false,
}: {
  study: StudyLike
  stage: PartLike
  activeStages: PartLike[]
  participation: ParticipationLike | null
  journeyEntries: EntryLike[]
  now?: Date
  strictOrder?: boolean
}): EntryAvailability {
  if (!isJourneyStage(stage)) {
    return { state: 'HIDDEN', reason: 'standard-part-inside-journey', recommended: false }
  }
  if (!acceptsParticipantEntries(study)) {
    return { state: 'CLOSED', reason: 'study-closed', recommended: false }
  }
  if (!participation?.consentedAt) {
    return { state: 'LOCKED', reason: 'participant-not-consented', recommended: false }
  }
  if (!stage.isActive) {
    return { state: 'HIDDEN', reason: 'part-inactive', recommended: false }
  }

  const existingEntry = journeyEntries.find((entry) => entry.partId === stage.id)
  if (existingEntry?.id) {
    return { state: 'SUBMITTED', reason: 'already-submitted', recommended: false, existingEntryId: existingEntry.id }
  }

  const closedReason = partWindowClosed(stage, participation, now)
  if (closedReason) {
    return { state: 'CLOSED', reason: closedReason, recommended: false }
  }

  const recommendedStage = earliestUnsubmittedJourneyStage(activeStages, journeyEntries)
  const recommended = recommendedStage?.id === stage.id
  if (strictOrder && !recommended) {
    return { state: 'LOCKED', reason: 'strict-previous-stage-required', recommended: false }
  }

  return {
    state: recommended ? 'RECOMMENDED' : 'AVAILABLE',
    reason: recommended ? 'recommended-next' : 'available-if-needed',
    recommended,
  }
}

export function canOpenEntryForm(state: EntryAvailabilityState) {
  return state === 'RECOMMENDED' || state === 'AVAILABLE'
}

export function entryQualityLabel(flag: string) {
  const labels: Record<string, string> = {
    late: 'Late',
    out_of_order: 'Out of order',
    retrospective: 'Retrospective',
  }
  return labels[flag] ?? flag.replaceAll('_', ' ')
}
