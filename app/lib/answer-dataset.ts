import { entryQualityLabel } from '@/app/lib/entry-state'

export const NOT_SHOWN_LABEL = 'Not shown'

export type AnswerVisibilityCell = {
  value?: string | null
  wasShown?: boolean | null
}

export type DatasetAnswerInput = {
  questionId: string
  value: string
  wasShown?: boolean | null
  tags?: { tag: { label: string } }[]
}

export type DatasetEntryInput = {
  id: string
  date: string
  submittedAt: Date | string
  timezone?: string | null
  isPilot?: boolean | null
  qualityFlags?: string[]
  user: { id: string; name: string; email: string }
  journey?: { id: string; label: string | null } | null
  answers: DatasetAnswerInput[]
}

export type DatasetPartInput = {
  id: string
  name: string
  entries: DatasetEntryInput[]
}

export type DatasetRow = {
  entryId: string
  partId: string
  partName: string
  participantId: string
  participantName: string
  participantEmail: string
  journeyId?: string | null
  journeyLabel?: string | null
  date: string
  submittedAt: string
  timezone: string | null
  isPilot: boolean
  qualityFlags: string[]
  answers: Record<string, string>
  answerShown: Record<string, boolean>
  answerTags: Record<string, string[]>
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value
}

export function cleanAnswerValue(value: string | null | undefined) {
  const trimmed = (value ?? '').trim()
  if (!trimmed || trimmed === 'N/A - not shown') return ''
  return trimmed
}

export function answerWasShown(cell: AnswerVisibilityCell | undefined | null) {
  return cell?.wasShown !== false
}

export function answerValue(cell: AnswerVisibilityCell | undefined | null) {
  return cleanAnswerValue(cell?.value)
}

export function parseMultipleChoiceAnswer(value: string | null | undefined) {
  const cleaned = cleanAnswerValue(value)
  if (!cleaned) return []

  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean)
  } catch {}

  return [cleaned]
}

export function formatAnswerValue(value: string | null | undefined, questionType: string) {
  if (questionType === 'MULTIPLE_CHOICE') return parseMultipleChoiceAnswer(value).join('; ')
  return cleanAnswerValue(value)
}

export function formatVisibleAnswer(cell: AnswerVisibilityCell | undefined | null, questionType: string) {
  if (!answerWasShown(cell)) return NOT_SHOWN_LABEL
  return formatAnswerValue(cell?.value, questionType)
}

export function dataTypeLabel(isPilot: boolean | null | undefined) {
  return isPilot ? 'Pilot' : 'Fieldwork'
}

export function formatQualityFlags(flags: string[]) {
  return flags.map(entryQualityLabel).join('; ')
}

export function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

export function buildDatasetRow(part: Pick<DatasetPartInput, 'id' | 'name'>, entry: DatasetEntryInput): DatasetRow {
  return {
    entryId: entry.id,
    partId: part.id,
    partName: part.name,
    participantId: entry.user.id,
    participantName: entry.user.name,
    participantEmail: entry.user.email,
    journeyId: entry.journey?.id ?? null,
    journeyLabel: entry.journey?.label ?? null,
    date: entry.date,
    submittedAt: toIsoString(entry.submittedAt),
    timezone: entry.timezone ?? null,
    isPilot: Boolean(entry.isPilot),
    qualityFlags: entry.qualityFlags ?? [],
    answers: Object.fromEntries(entry.answers.map((answer) => [answer.questionId, answer.value])),
    answerShown: Object.fromEntries(entry.answers.map((answer) => [answer.questionId, answer.wasShown !== false])),
    answerTags: Object.fromEntries(entry.answers.map((answer) => [
      answer.questionId,
      (answer.tags ?? []).map((answerTag) => answerTag.tag.label),
    ])),
  }
}

export function buildDatasetRows(parts: DatasetPartInput[]) {
  return parts.flatMap((part) => part.entries.map((entry) => buildDatasetRow(part, entry)))
}

export function filterDatasetRowsByPilot(rows: DatasetRow[], includePilotData: boolean) {
  return includePilotData ? rows : rows.filter((row) => !row.isPilot)
}

export function countPilotRows(rows: DatasetRow[]) {
  return rows.filter((row) => row.isPilot).length
}

export function datasetHasJourney(rows: DatasetRow[]) {
  return rows.some((row) => row.journeyId || row.journeyLabel)
}

export function datasetQualityFlags(rows: DatasetRow[]) {
  return Array.from(new Set(rows.flatMap((row) => row.qualityFlags))).sort()
}
