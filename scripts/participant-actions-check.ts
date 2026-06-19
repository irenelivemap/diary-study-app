/**
 * Checks that participant-facing actions cannot accidentally perform admin-only behavior.
 */
import assert from 'node:assert/strict'
import {
  countPendingParticipantActions,
  isSequentialPartUnlocked,
  resolveJourneyNextStage,
  resolveJourneyStageParticipantAction,
  resolveStandardParticipantAction,
} from '../app/lib/participant-actions'

const today = '2026-06-10'
const joinedAt = new Date('2026-06-01T09:00:00Z')
const consentedAt = new Date('2026-06-01T09:05:00Z')

function standardPart(overrides: Partial<Parameters<typeof resolveStandardParticipantAction>[0]['part']> = {}) {
  return {
    id: overrides.id ?? 'part-standard',
    name: overrides.name ?? 'Daily check-in',
    flow: overrides.flow ?? 'STANDARD',
    isActive: overrides.isActive ?? true,
    entryPolicy: overrides.entryPolicy ?? 'MULTIPLE_PER_DAY',
    targetEntries: overrides.targetEntries ?? null,
    durationDays: overrides.durationDays ?? null,
    dueDate: overrides.dueDate ?? null,
    unlockRule: overrides.unlockRule ?? 'IMMEDIATE',
    unlockAt: overrides.unlockAt ?? null,
    entries: overrides.entries ?? [],
    _count: overrides._count ?? { entries: overrides.entries?.length ?? 0 },
  }
}

function study(overrides: Partial<Parameters<typeof resolveStandardParticipantAction>[0]['study']> = {}) {
  const parts = overrides.parts ?? [standardPart()]
  return {
    id: overrides.id ?? 'study',
    isActive: overrides.isActive ?? true,
    isArchived: overrides.isArchived ?? false,
    sequential: overrides.sequential ?? false,
    parts,
    journeys: overrides.journeys ?? [],
  }
}

function journeyStage(id: string, name: string, order: number) {
  return {
    id,
    name,
    flow: 'JOURNEY_STAGE',
    isActive: true,
    entryPolicy: 'MULTIPLE_PER_DAY',
    targetEntries: null,
    durationDays: null,
    dueDate: null,
    unlockRule: order === 1 ? 'IMMEDIATE' : 'AFTER_PREVIOUS_TARGET',
    unlockAt: null,
    entries: [],
    _count: { entries: 0 },
  }
}

const participation = { joinedAt, consentedAt }

const openStandard = resolveStandardParticipantAction({
  study: study(),
  part: standardPart(),
  partIndex: 0,
  participation,
  today,
})
assert.equal(openStandard.canSubmit, true)
assert.equal(openStandard.currentStatus, 'Ready when something happens')

const oncePerDaySubmitted = resolveStandardParticipantAction({
  study: study(),
  part: standardPart({
    entryPolicy: 'ONCE_PER_DAY',
    entries: [{ id: 'entry-today', date: today }],
    _count: { entries: 1 },
  }),
  partIndex: 0,
  participation,
  today,
})
assert.equal(oncePerDaySubmitted.canSubmit, false)
assert.equal(oncePerDaySubmitted.entryState.state, 'SUBMITTED')
assert.equal(oncePerDaySubmitted.entryState.existingEntryId, 'entry-today')

const firstSequentialPart = standardPart({
  id: 'part-1',
  name: 'Part 1',
  targetEntries: 2,
  entries: [{ id: 'one-entry', date: today }],
  _count: { entries: 1 },
})
const secondSequentialPart = standardPart({ id: 'part-2', name: 'Part 2', unlockRule: 'AFTER_PREVIOUS_TARGET' })
const sequentialStudy = study({ sequential: true, parts: [firstSequentialPart, secondSequentialPart] })
assert.equal(isSequentialPartUnlocked(sequentialStudy, 1), false)
assert.equal(
  resolveStandardParticipantAction({
    study: sequentialStudy,
    part: secondSequentialPart,
    partIndex: 1,
    participation,
    today,
  }).entryState.state,
  'LOCKED'
)

const closedAction = resolveStandardParticipantAction({
  study: study({ isActive: false }),
  part: standardPart(),
  partIndex: 0,
  participation,
  today,
})
assert.equal(closedAction.canSubmit, false)
assert.equal(closedAction.entryState.reason, 'study-closed')

const before = journeyStage('before', 'Before', 1)
const during = journeyStage('during', 'During', 2)
const after = journeyStage('after', 'After', 3)
const journeyStudy = study({ parts: [before, during, after], journeys: [] })
const journey = {
  id: 'journey-1',
  label: 'Visit #1',
  completedAt: null,
  entries: [
    { id: 'before-entry', partId: 'before', date: today, submittedAt: new Date('2026-06-10T09:00:00Z') },
    { id: 'after-entry', partId: 'after', date: today, submittedAt: new Date('2026-06-10T11:00:00Z') },
  ],
}
const missingStage = resolveJourneyNextStage([before, during, after], journey)
assert.equal(missingStage?.stage.id, 'during')
assert.equal(missingStage?.isMissingEarlierStage, true)

const flexibleDuring = resolveJourneyStageParticipantAction({
  study: journeyStudy,
  stage: during,
  activeStages: [before, during, after],
  participation,
  journey,
  strictOrder: false,
})
assert.equal(flexibleDuring.canAnswer, true)
assert.equal(flexibleDuring.isRecommended, true)

const strictAfter = resolveJourneyStageParticipantAction({
  study: journeyStudy,
  stage: after,
  activeStages: [before, during, after],
  participation,
  journey: {
    id: 'journey-2',
    label: 'Visit #2',
    completedAt: null,
    entries: [{ id: 'before-entry', partId: 'before', date: today }],
  },
  strictOrder: true,
})
assert.equal(strictAfter.canAnswer, false)
assert.equal(strictAfter.isLocked, true)

const pendingCount = countPendingParticipantActions({
  today,
  participations: [
    {
      joinedAt,
      consentedAt,
      study: study({ parts: [standardPart({ targetEntries: 1 })] }),
    },
    {
      joinedAt,
      consentedAt,
      study: study({
        parts: [before, during, after],
        journeys: [{ id: 'open-journey', label: 'Visit #1', completedAt: null, entries: [] }],
      }),
    },
  ],
})
assert.equal(pendingCount, 2)

const closedPendingCount = countPendingParticipantActions({
  today,
  participations: [
    {
      joinedAt,
      consentedAt,
      study: study({
        isActive: false,
        status: 'CLOSED',
        parts: [before, during, after],
        journeys: [{ id: 'closed-open-journey', label: 'Visit #1', completedAt: null, entries: [] }],
      }),
    },
    {
      joinedAt,
      consentedAt,
      study: study({
        isActive: true,
        isArchived: true,
        status: 'ARCHIVED',
        parts: [standardPart({ targetEntries: 1 })],
      }),
    },
  ],
})
assert.equal(closedPendingCount, 0)

console.log('Participant action checks passed.')
