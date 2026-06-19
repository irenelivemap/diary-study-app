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

function firstString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
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
    rows,
    summary: buildAnalysisSummary({
      filters: normalizedFilters,
      parts: study.parts.map((part) => ({ id: part.id, name: part.name, flow: part.flow })),
      questions,
      rows,
    }),
  }
}
