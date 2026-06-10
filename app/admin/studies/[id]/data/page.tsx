import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import DataExplorer from '@/app/components/DataExplorer'
import NavBar from '@/app/components/NavBar'
import StudyTabs from '@/app/components/StudyTabs'
import { plainTextFromHtml } from '@/app/lib/sanitize-html'

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

  const allRows = study.parts.flatMap((p) =>
    p.entries.map((e) => ({
      entryId: e.id,
      partId: p.id,
      partName: p.name,
      participantId: e.user.id,
      participantName: e.user.name,
      participantEmail: e.user.email,
      journeyId: e.journey?.id ?? null,
      journeyLabel: e.journey?.label ?? null,
      date: e.date,
      submittedAt: e.submittedAt.toISOString(),
      timezone: e.timezone,
      qualityFlags: e.qualityFlags,
      answers: Object.fromEntries(e.answers.map((a) => [a.questionId, a.value])),
      answerShown: Object.fromEntries(e.answers.map((a) => [a.questionId, a.wasShown])),
      answerTags: Object.fromEntries(e.answers.map((a) => [
        a.questionId,
        a.tags.map((answerTag) => answerTag.tag.label),
      ])),
    }))
  )

  const parts = study.parts.map((p) => ({ id: p.id, name: p.name }))

  const participants = study.participants.map((participant) => ({
    id: participant.user.id,
    name: participant.user.name,
    email: participant.user.email,
  }))

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar name={session.name} role="ADMIN" canSwitchModes />
      <StudyTabs studyId={id} active="responses" studyName={study.name} isActive={study.isActive} />

      <div className="max-w-full px-4 sm:px-6 py-6">
        <DataExplorer
          studyId={id}
          studyName={study.name}
          studyVersion={study.version}
          parts={parts}
          participants={participants}
          questions={allQuestions}
          rows={allRows}
        />
      </div>
    </div>
  )
}
