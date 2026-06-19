import 'server-only'

import { prisma } from '@/app/lib/db'
import { buildDatasetRow } from '@/app/lib/answer-dataset'
import { plainTextFromHtml } from '@/app/lib/sanitize-html'

export async function loadStudyDataTableData(studyId: string) {
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

  const entries = await prisma.entry.findMany({
    where: { studyId },
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
  })

  const parts = study.parts.map((part) => ({ id: part.id, name: part.name }))
  const partById = new Map(parts.map((part) => [part.id, part]))

  return {
    studyName: study.name,
    studyVersion: study.version,
    includePilotByDefault: study.status === 'PREPARATION',
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
