import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import DataExplorer from '@/app/components/DataExplorer'
import NavBar from '@/app/components/NavBar'
import StudyTabs from '@/app/components/StudyTabs'
import { plainTextFromHtml } from '@/app/lib/sanitize-html'
import { buildDatasetRows } from '@/app/lib/answer-dataset'

export default async function DataPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')

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
          entries: {
            include: {
              user: { select: { id: true, name: true, email: true } },
              journey: { select: { id: true, label: true, createdAt: true, completedAt: true } },
              answers: {
                include: {
                  tags: { include: { tag: true }, orderBy: { tag: { label: 'asc' } } },
                },
              },
            },
            orderBy: [{ userId: 'asc' }, { date: 'asc' }],
          },
        },
      },
    },
  })
  if (!study) notFound()
  const includePilotByDefault = study.status === 'PREPARATION'

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

  const allRows = buildDatasetRows(study.parts)

  const parts = study.parts.map((p) => ({ id: p.id, name: p.name }))

  const participants = study.participants.map((participant) => ({
    id: participant.user.id,
    name: participant.user.name,
    email: participant.user.email,
  }))

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <NavBar name={session.name} role="ADMIN" canSwitchModes />
      <StudyTabs studyId={id} active="responses" studyName={study.name} isActive={study.isActive} status={study.status} />

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
    </div>
  )
}
