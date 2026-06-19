/**
 * Loads the analysis dashboard dataset for a study.
 */
import 'server-only'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/db'
import { answerValue, answerWasShown } from '@/app/lib/answer-dataset'
import { plainTextFromHtml } from '@/app/lib/sanitize-html'

export type StudyAnalysisFilters = {
  includePilotData?: boolean
  partId: string
  participantId: string
  questionType: string
  dateFrom: string
  dateTo: string
}

export type StudyAnalysisSummary = {
  entryCount: number
  participantCount: number
  answered: number
  eligible: number
  missing: number
  notShown: number
  coverage: number
  qualityFlagEntries: { flag: string; count: number }[]
  journeyContinuity: {
    journeyCount: number
    completedCount: number
    averageStages: number
    stageCoverage: { partId: string; partName: string; count: number; percent: number }[]
  } | null
}

export type StudyQuestionAnalysis = {
  values: string[]
  eligible: number
  answered: number
  missing: number
  notShown: number
  numeric: number[]
  points: { label: string; value: number }[]
  scalePoints?: { score: number; label: string; count: number }[]
  ratingBins?: { label: string; start: number; end: number; count: number }[]
  shouldBin?: boolean
  mean: number | null
  median: number | null
  q1?: number | null
  q3?: number | null
  mode?: string
  polarity?: { low: number; middle: number; high: number }
  minScale?: number
  maxScale?: number
  examples: string[]
}

function firstString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function topCounts(values: string[]) {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

function average(values: number[]) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function observedQuantile(values: number[], q: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.round((sorted.length - 1) * q)]
}

function mostCommon(points: { score: number; count: number }[]) {
  const max = Math.max(...points.map((point) => point.count), 0)
  if (!max) return '-'
  return points.filter((point) => point.count === max).map((point) => String(point.score)).join(', ')
}

function buildScaleBins(values: number[], min: number, max: number, targetBins = 8) {
  const range = max - min
  if (range <= 0) return [{ label: String(min), start: min, end: max, count: values.length }]
  const binCount = Math.min(targetBins, Math.max(1, Math.ceil(range + 1)))
  const width = (range + 1) / binCount
  return Array.from({ length: binCount }, (_, index) => {
    const start = min + index * width
    const end = index === binCount - 1 ? max : min + (index + 1) * width
    const count = values.filter((value) => value >= start && (index === binCount - 1 ? value <= end : value < end)).length
    const label = width <= 1 ? String(Math.round(start)) : `${start.toFixed(0)}-${end.toFixed(0)}`
    return { label, start, end, count }
  })
}

function scaleBand(score: number, min: number, max: number) {
  const range = max - min + 1
  const lowEnd = min + Math.floor(range / 3) - 1
  const highStart = max - Math.floor(range / 3) + 1
  if (score <= lowEnd) return 'low'
  if (score >= highStart) return 'high'
  return 'middle'
}

function parseMultipleChoiceAnswer(value: string) {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {}
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

export function parseStudyAnalysisFilters(searchParams: Record<string, string | string[] | undefined>): StudyAnalysisFilters {
  const includePilotParam = firstString(searchParams.includePilot)
  return {
    includePilotData: includePilotParam ? includePilotParam === 'true' : undefined,
    partId: firstString(searchParams.part) || 'all',
    participantId: firstString(searchParams.participant) || 'all',
    questionType: firstString(searchParams.type) || 'all',
    dateFrom: firstString(searchParams.from),
    dateTo: firstString(searchParams.to),
  }
}

function entryWhere(studyId: string, filters: StudyAnalysisFilters, includePilotByDefault: boolean): Prisma.EntryWhereInput {
  const includePilotData = filters.includePilotData ?? includePilotByDefault
  return {
    studyId,
    ...(includePilotData ? {} : { isPilot: false }),
    ...(filters.partId !== 'all' ? { partId: filters.partId } : {}),
    ...(filters.participantId !== 'all' ? { userId: filters.participantId } : {}),
    ...((filters.dateFrom || filters.dateTo) ? {
      date: {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {}),
      },
    } : {}),
  }
}

type AnalysisQuestion = {
  id: string
  partId: string
  partName: string
  type: string
}

type AnalysisRow = {
  entryId: string
  partId: string
  participantId: string
  journeyId?: string | null
  journeyLabel?: string | null
  qualityFlags: string[]
  answers: Record<string, { value: string; wasShown: boolean }>
}

function buildJourneyContinuity(
  parts: { id: string; name: string; flow?: string }[],
  rows: AnalysisRow[]
): StudyAnalysisSummary['journeyContinuity'] {
  const journeyRows = rows.filter((row) => row.journeyId || row.journeyLabel)
  if (!journeyRows.length) return null

  const stageParts = parts.filter((part) => part.flow === 'JOURNEY_STAGE')
  const expectedStageIds = new Set((stageParts.length ? stageParts : parts).map((part) => part.id))
  const journeys = new Map<string, Set<string>>()

  for (const row of journeyRows) {
    const key = row.journeyId || row.journeyLabel
    if (!key) continue
    const stageSet = journeys.get(key) ?? new Set<string>()
    if (expectedStageIds.has(row.partId)) stageSet.add(row.partId)
    journeys.set(key, stageSet)
  }

  const journeyCount = journeys.size
  if (!journeyCount) return null

  const completedCount = Array.from(journeys.values())
    .filter((stageSet) => expectedStageIds.size > 0 && stageSet.size >= expectedStageIds.size)
    .length
  const averageStages = Array.from(journeys.values())
    .reduce((sum, stageSet) => sum + stageSet.size, 0) / journeyCount
  const stageCoverage = Array.from(expectedStageIds).map((partId) => {
    const part = parts.find((candidate) => candidate.id === partId)
    const count = Array.from(journeys.values()).filter((stageSet) => stageSet.has(partId)).length
    return {
      partId,
      partName: part?.name ?? 'Stage',
      count,
      percent: Math.round((count / journeyCount) * 100),
    }
  })

  return { journeyCount, completedCount, averageStages, stageCoverage }
}

function buildAnalysisSummary({
  filters,
  parts,
  questions,
  rows,
}: {
  filters: StudyAnalysisFilters
  parts: { id: string; name: string; flow?: string }[]
  questions: AnalysisQuestion[]
  rows: AnalysisRow[]
}): StudyAnalysisSummary {
  const filteredQuestions = questions.filter((question) => {
    if (question.type === 'CONTENT' || question.type === 'SCREENSHOT') return false
    if (filters.partId !== 'all' && question.partId !== filters.partId) return false
    if (filters.questionType !== 'all' && question.type !== filters.questionType) return false
    return true
  })

  const coverageTotals = filteredQuestions.reduce((totals, question) => {
    const partRows = rows.filter((row) => row.partId === question.partId)
    const eligibleRows = partRows.filter((row) => answerWasShown(row.answers[question.id]))
    const notShown = partRows.filter((row) => row.answers[question.id]?.wasShown === false).length
    const answered = eligibleRows.map((row) => answerValue(row.answers[question.id])).filter(Boolean).length
    const eligible = eligibleRows.length
    return {
      answered: totals.answered + answered,
      eligible: totals.eligible + eligible,
      missing: totals.missing + Math.max(0, eligible - answered),
      notShown: totals.notShown + notShown,
    }
  }, { answered: 0, eligible: 0, missing: 0, notShown: 0 })

  const qualityFlagCounts = rows.reduce((counts, row) => {
    for (const flag of row.qualityFlags) counts.set(flag, (counts.get(flag) ?? 0) + 1)
    return counts
  }, new Map<string, number>())

  return {
    entryCount: rows.length,
    participantCount: new Set(rows.map((row) => row.participantId)).size,
    ...coverageTotals,
    coverage: coverageTotals.eligible ? Math.round((coverageTotals.answered / coverageTotals.eligible) * 100) : 0,
    qualityFlagEntries: Array.from(qualityFlagCounts.entries())
      .map(([flag, count]) => ({ flag, count }))
      .sort((a, b) => b.count - a.count),
    journeyContinuity: buildJourneyContinuity(parts, rows),
  }
}

function eligibleRowsForQuestion(question: AnalysisQuestion & {
  scaleType?: string | null
  options?: string[]
  min?: number | null
  max?: number | null
}, rows: AnalysisRow[]) {
  return rows.filter((row) => {
    if (row.partId !== question.partId) return false
    return answerWasShown(row.answers[question.id])
  })
}

function buildQuestionAnalysis(
  question: AnalysisQuestion & {
    scaleType?: string | null
    options?: string[]
    min?: number | null
    max?: number | null
  },
  rows: AnalysisRow[]
): StudyQuestionAnalysis {
  const eligibleRows = eligibleRowsForQuestion(question, rows)
  const notShown = rows.filter((row) => row.partId === question.partId && row.answers[question.id]?.wasShown === false).length
  const values = eligibleRows.map((row) => answerValue(row.answers[question.id])).filter(Boolean)
  const answered = values.length
  const eligible = eligibleRows.length
  const missing = Math.max(0, eligible - answered)
  const numeric = values.map(Number).filter((value) => Number.isFinite(value))
  const min = question.min ?? (numeric.length ? Math.min(...numeric) : 1)
  const max = question.max ?? (numeric.length ? Math.max(...numeric) : 7)

  if (question.type === 'RATING') {
    const scaleLength = max - min + 1
    const shouldBin = question.scaleType === 'vas' || scaleLength > 9
    const scalePoints = Array.from({ length: max - min + 1 }, (_, index) => {
      const value = min + index
      const usesScaleLabels = question.scaleType === 'numbers_labeled' || question.scaleType === 'labels_only'
      const label = usesScaleLabels ? question.options?.[index]?.trim() || 'No label' : String(value)
      return { score: value, label, count: numeric.filter((answer) => answer === value).length }
    })
    const ratingBins = shouldBin ? buildScaleBins(numeric, min, max) : []
    const peakBin = ratingBins.slice().sort((a, b) => b.count - a.count)[0]
    const low = numeric.filter((value) => scaleBand(value, min, max) === 'low').length
    const middle = numeric.filter((value) => scaleBand(value, min, max) === 'middle').length
    const high = numeric.filter((value) => scaleBand(value, min, max) === 'high').length
    return {
      values,
      eligible,
      answered,
      missing,
      notShown,
      numeric,
      points: scalePoints.map((point) => ({ label: String(point.score), value: point.count })),
      scalePoints,
      ratingBins,
      shouldBin,
      mean: average(numeric),
      median: median(numeric),
      q1: observedQuantile(numeric, 0.25),
      q3: observedQuantile(numeric, 0.75),
      mode: shouldBin ? (peakBin?.count ? peakBin.label : '-') : mostCommon(scalePoints),
      polarity: { low, middle, high },
      minScale: min,
      maxScale: max,
      examples: [],
    }
  }

  if (question.type === 'YES_NO') {
    const points = ['Yes', 'No'].map((label) => ({ label, value: values.filter((value) => value === label).length }))
    return { values, eligible, answered, missing, notShown, numeric, points, mean: null, median: null, examples: [] }
  }

  if (question.type === 'SCREENSHOT') {
    return { values, eligible, answered, missing, notShown, numeric, points: [{ label: 'Uploaded', value: answered }], mean: null, median: null, examples: [] }
  }

  if (question.type === 'DATE_TIME') {
    const localHours = values.flatMap((value) => {
      const match = value.match(/T(\d{2}):\d{2}/)
      return match ? [`${match[1]}:00`] : []
    })
    return { values, eligible, answered, missing, notShown, numeric, points: topCounts(localHours).sort((a, b) => a.label.localeCompare(b.label)), mean: null, median: null, examples: [] }
  }

  if (question.type === 'FREE_TEXT') {
    return { values, eligible, answered, missing, notShown, numeric, points: [{ label: 'Answered', value: answered }], mean: null, median: null, examples: values.slice(0, 5) }
  }

  const points = question.type === 'MULTIPLE_CHOICE'
    ? topCounts(values.flatMap(parseMultipleChoiceAnswer))
    : topCounts(values)
  return { values, eligible, answered, missing, notShown, numeric, points, mean: null, median: null, examples: [] }
}

function compactQuestionAnalysis(analysis: StudyQuestionAnalysis): StudyQuestionAnalysis {
  return {
    ...analysis,
    values: [],
    numeric: [],
    examples: [],
  }
}

export async function loadStudyAnalysisData(studyId: string, filters: StudyAnalysisFilters = parseStudyAnalysisFilters({})) {
  const study = await prisma.study.findUnique({
    where: { id: studyId },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      parts: {
        orderBy: { order: 'asc' },
        include: {
          questions: {
            orderBy: [{ page: 'asc' }, { order: 'asc' }],
            include: { tagDefinitions: { orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] } },
          },
        },
      },
    },
  })
  if (!study) return null

  const includePilotByDefault = study.status === 'PREPARATION'
  const normalizedFilters = {
    ...filters,
    includePilotData: filters.includePilotData ?? includePilotByDefault,
  }
  const entries = await prisma.entry.findMany({
    where: entryWhere(studyId, normalizedFilters, includePilotByDefault),
    orderBy: [{ userId: 'asc' }, { date: 'asc' }],
    select: {
      id: true,
      partId: true,
      date: true,
      submittedAt: true,
      timezone: true,
      isPilot: true,
      qualityFlags: true,
      user: { select: { id: true, name: true, email: true } },
      journey: { select: { id: true, label: true, completedAt: true, createdAt: true } },
      answers: {
        select: {
          id: true,
          questionId: true,
          value: true,
          wasShown: true,
          tags: {
            select: { tag: { select: { id: true, label: true, color: true } } },
            orderBy: { tag: { label: 'asc' } },
          },
        },
      },
    },
  })
  const pilotRowCount = await prisma.entry.count({ where: { studyId, isPilot: true } })

  const questions = study.parts.flatMap((part) =>
    part.questions.map((question) => ({
      id: question.id,
      partId: part.id,
      partName: part.name,
      text: plainTextFromHtml(question.text),
      type: question.type,
      scaleType: question.scaleType,
      options: question.options,
      min: question.min,
      max: question.max,
      tagDefinitions: question.tagDefinitions.map((tag) => ({
        id: tag.id,
        label: tag.label,
        color: tag.color,
        parentId: tag.parentId,
        description: tag.description,
        sortOrder: tag.sortOrder,
        isTheme: tag.isTheme,
      })),
    }))
  )

  const partNameById = new Map(study.parts.map((part) => [part.id, part.name]))
  const freeTextQuestionIds = new Set(questions.filter((question) => question.type === 'FREE_TEXT').map((question) => question.id))
  const rows = entries.flatMap((entry) => {
    const partName = partNameById.get(entry.partId)
    if (!partName) return []
    return [{
      entryId: entry.id,
      partId: entry.partId,
      partName,
      participantId: entry.user.id,
      participantName: entry.user.name,
      participantEmail: entry.user.email,
      journeyId: entry.journey?.id ?? null,
      journeyLabel: entry.journey?.label ?? null,
      journeyCompletedAt: entry.journey?.completedAt?.toISOString() ?? null,
      journeyCreatedAt: entry.journey?.createdAt.toISOString() ?? null,
      date: entry.date,
      submittedAt: entry.submittedAt.toISOString(),
      timezone: entry.timezone,
      isPilot: entry.isPilot,
      qualityFlags: entry.qualityFlags,
      answers: Object.fromEntries(entry.answers.map((answer) => [
        answer.questionId,
        {
          id: answer.id,
          value: answer.value,
          wasShown: answer.wasShown,
          tags: answer.tags.map((answerTag) => ({
            id: answerTag.tag.id,
            label: answerTag.tag.label,
            color: answerTag.tag.color,
          })),
        },
      ])),
    }]
  })
  const clientRows = rows.map((row) => ({
    ...row,
    answers: Object.fromEntries(
      Object.entries(row.answers).filter(([questionId]) => freeTextQuestionIds.has(questionId))
    ),
  }))
  const questionSummaries = Object.fromEntries(
    questions
      .filter((question) => question.type !== 'CONTENT' && question.type !== 'SCREENSHOT')
      .map((question) => [question.id, compactQuestionAnalysis(buildQuestionAnalysis(question, rows))])
  )

  return {
    studyName: study.name,
    includePilotByDefault,
    filters: normalizedFilters,
    pilotRowCount,
    parts: study.parts.map((part) => ({ id: part.id, name: part.name, flow: part.flow })),
    participants: study.participants.map((participant) => ({
      id: participant.user.id,
      name: participant.user.name,
      email: participant.user.email,
    })),
    questions,
    rows: clientRows,
    questionSummaries,
    summary: buildAnalysisSummary({
      filters: normalizedFilters,
      parts: study.parts.map((part) => ({ id: part.id, name: part.name, flow: part.flow })),
      questions,
      rows,
    }),
  }
}
