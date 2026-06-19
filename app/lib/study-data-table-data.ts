import 'server-only'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/db'
import { buildDatasetRow } from '@/app/lib/answer-dataset'
import { plainTextFromHtml } from '@/app/lib/sanitize-html'

export const DATA_TABLE_PAGE_SIZE = 100

export type StudyDataTableFilters = {
  includePilotData?: boolean
  partIds: string[]
  participantIds: string[]
  qualityFlags: string[]
  dateFrom: string
  dateTo: string
  search: string
  page: number
}

function stringList(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.flatMap((item) => item.split(','))
  return (value ?? '').split(',').map((item) => item.trim()).filter(Boolean)
}

function firstString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export function parseStudyDataTableFilters(searchParams: Record<string, string | string[] | undefined>): StudyDataTableFilters {
  const page = Number.parseInt(firstString(searchParams.page), 10)
  const includePilotParam = firstString(searchParams.includePilot)
  return {
    includePilotData: includePilotParam ? includePilotParam === 'true' : undefined,
    partIds: stringList(searchParams.parts),
    participantIds: stringList(searchParams.participants),
    qualityFlags: stringList(searchParams.quality),
    dateFrom: firstString(searchParams.from),
    dateTo: firstString(searchParams.to),
    search: firstString(searchParams.search).trim(),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  }
}

function entryWhere(studyId: string, filters: StudyDataTableFilters, includePilotByDefault: boolean): Prisma.EntryWhereInput {
  const query = filters.search.trim()
  const includePilotData = filters.includePilotData ?? includePilotByDefault
  return {
    studyId,
    ...(includePilotData ? {} : { isPilot: false }),
    ...(filters.partIds.length > 0 ? { partId: { in: filters.partIds } } : {}),
    ...(filters.participantIds.length > 0 ? { userId: { in: filters.participantIds } } : {}),
    ...(filters.qualityFlags.length > 0 ? { qualityFlags: { hasSome: filters.qualityFlags } } : {}),
    ...((filters.dateFrom || filters.dateTo) ? {
      date: {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {}),
      },
    } : {}),
    ...(query ? {
      OR: [
        { id: { contains: query, mode: 'insensitive' } },
        { date: { contains: query, mode: 'insensitive' } },
        { user: { name: { contains: query, mode: 'insensitive' } } },
        { user: { email: { contains: query, mode: 'insensitive' } } },
        { journey: { label: { contains: query, mode: 'insensitive' } } },
        { part: { name: { contains: query, mode: 'insensitive' } } },
        { answers: { some: { value: { contains: query, mode: 'insensitive' } } } },
        { answers: { some: { tags: { some: { tag: { label: { contains: query, mode: 'insensitive' } } } } } } },
      ],
    } : {}),
  }
}

export async function loadStudyDataTableData(studyId: string, filters: StudyDataTableFilters = parseStudyDataTableFilters({})) {
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
          questions: { orderBy: [{ page: 'asc' }, { order: 'asc' }] },
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
  const where = entryWhere(studyId, normalizedFilters, includePilotByDefault)
  const pageSize = DATA_TABLE_PAGE_SIZE
  const entryMeta = await prisma.entry.findMany({
    where: { studyId },
    select: { isPilot: true, qualityFlags: true, journeyId: true, journey: { select: { label: true } } },
  })
  const [totalRows, entries] = await prisma.$transaction([
    prisma.entry.count({ where }),
    prisma.entry.findMany({
    where,
    orderBy: [{ submittedAt: 'desc' }],
    skip: (filters.page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      partId: true,
      date: true,
      submittedAt: true,
      timezone: true,
      isPilot: true,
      qualityFlags: true,
      user: { select: { id: true, name: true, email: true } },
      journey: { select: { id: true, label: true } },
      answers: {
        select: {
          questionId: true,
          value: true,
          wasShown: true,
          tags: {
            select: { tag: { select: { label: true } } },
            orderBy: { tag: { label: 'asc' } },
          },
        },
      },
    },
    }),
  ])

  const parts = study.parts.map((part) => ({ id: part.id, name: part.name }))
  const partById = new Map(parts.map((part) => [part.id, part]))

  return {
    studyName: study.name,
    studyVersion: study.version,
    includePilotByDefault,
    filters: normalizedFilters,
    pageSize,
    totalRows,
    pilotRowCount: entryMeta.filter((entry) => entry.isPilot).length,
    availableQualityFlags: Array.from(new Set(entryMeta.flatMap((entry) => entry.qualityFlags))).sort(),
    showJourney: entryMeta.some((entry) => entry.journeyId || entry.journey?.label),
    parts,
    participants: study.participants.map((participant) => ({
      id: participant.user.id,
      name: participant.user.name,
      email: participant.user.email,
    })),
    questions: study.parts.flatMap((part) =>
      part.questions.map((question) => ({
        id: question.id,
        partId: part.id,
        partName: part.name,
        text: plainTextFromHtml(question.text),
        type: question.type,
      }))
    ),
    rows: entries.flatMap((entry) => {
      const part = partById.get(entry.partId)
      return part ? [buildDatasetRow(part, entry)] : []
    }),
  }
}
