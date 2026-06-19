/**
 * Defines study lifecycle behavior such as preparation, active, closed, archived, and pilot data.
 */
import { StudyStatus } from '@prisma/client'

type StudyLifecycleLike = {
  status?: StudyStatus | null
  isActive: boolean
  isArchived: boolean
}

export function resolveStudyStatus(study: StudyLifecycleLike): StudyStatus {
  if (study.status) return study.status
  if (study.isArchived) return StudyStatus.ARCHIVED
  if (study.isActive) return StudyStatus.ACTIVE
  return StudyStatus.CLOSED
}

export function studyStatusLabel(status: StudyStatus) {
  const labels: Record<StudyStatus, string> = {
    PREPARATION: 'In preparation',
    ACTIVE: 'Active',
    CLOSED: 'Closed',
    ARCHIVED: 'Archived',
  }
  return labels[status]
}

export function studyStatusHelp(status: StudyStatus) {
  const help: Record<StudyStatus, string> = {
    PREPARATION: 'Design and pilot testing. Entries are test data until launch.',
    ACTIVE: 'Real fieldwork is running. Participants can join and submit entries.',
    CLOSED: 'Fieldwork is stopped. Data, analysis and exports stay available.',
    ARCHIVED: 'Stored in past studies. Data is kept and participant activity is stopped.',
  }
  return help[status]
}

export function acceptsParticipantEntries(study: StudyLifecycleLike) {
  const status = resolveStudyStatus(study)
  return status === StudyStatus.PREPARATION || status === StudyStatus.ACTIVE
}

export function sendsAutomaticReminders(study: StudyLifecycleLike) {
  return resolveStudyStatus(study) === StudyStatus.ACTIVE
}

export function isPilotSubmission(study: StudyLifecycleLike) {
  return resolveStudyStatus(study) === StudyStatus.PREPARATION
}

export function isArchivedStatus(study: StudyLifecycleLike) {
  return resolveStudyStatus(study) === StudyStatus.ARCHIVED
}

export function lifecyclePersistence(status: StudyStatus) {
  return {
    status,
    isArchived: status === StudyStatus.ARCHIVED,
    isActive: status === StudyStatus.PREPARATION || status === StudyStatus.ACTIVE,
  }
}

export function normalWorkspaceStatus(status: StudyStatus) {
  return status === StudyStatus.ARCHIVED ? StudyStatus.CLOSED : status
}

export function statusBadgeClass(status: StudyStatus) {
  const classes: Record<StudyStatus, string> = {
    PREPARATION: 'bg-sky-50 text-sky-700 ring-sky-100',
    ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    CLOSED: 'bg-slate-100 text-slate-700 ring-slate-200',
    ARCHIVED: 'bg-slate-100 text-slate-600 ring-slate-200',
  }
  return classes[status]
}
