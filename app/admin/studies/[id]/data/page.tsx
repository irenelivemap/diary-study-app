import { notFound } from 'next/navigation'
import { prisma } from '@/app/lib/db'
import DataExplorer from '@/app/components/DataExplorer'
import { plainTextFromHtml } from '@/app/lib/sanitize-html'
import { buildDatasetRow } from '@/app/lib/answer-dataset'

export default async function DataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const study = await prisma.study.findUnique({
    where: { id },
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
  if (!study) notFound()
  const includePilotByDefault = study.status === 'PREPARATION'
  const entries = await prisma.entry.findMany({
    where: { studyId: id },
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

  // Flatten into a serialisable structure
  const allQuestions = study.parts.flatMap((p) =>
    p.questions.map((q) => ({
      id: q.id,
      partId: p.id,
      partName: p.name,
      text: plainTextFromHtml(q.text),
      type: q.type,
    }))
  )

  const partById = new Map(study.parts.map((part) => [part.id, { id: part.id, name: part.name }]))
  const allRows = entries.flatMap((entry) => {
    const part = partById.get(entry.partId)
    return part ? [buildDatasetRow(part, entry)] : []
  })

  const parts = study.parts.map((p) => ({ id: p.id, name: p.name }))

  const participants = study.participants.map((participant) => ({
    id: participant.user.id,
    name: participant.user.name,
    email: participant.user.email,
  }))

  return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <DataExplorer
          studyId={id}
          studyName={study.name}
          studyVersion={study.version}
          includePilotByDefault={includePilotByDefault}
          parts={parts}
          participants={participants}
          questions={allQuestions}
          rows={allRows}
        />
      </div>
  )
}
