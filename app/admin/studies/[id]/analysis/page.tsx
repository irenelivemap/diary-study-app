import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import AnalysisDashboard from '@/app/components/AnalysisDashboard'
import NavBar from '@/app/components/NavBar'
import StudyTabs from '@/app/components/StudyTabs'
import { plainTextFromHtml } from '@/app/lib/sanitize-html'

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
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
          questions: {
            orderBy: [{ page: 'asc' }, { order: 'asc' }],
            include: { tagDefinitions: { orderBy: { label: 'asc' } } },
          },
          entries: {
            include: {
              user: { select: { id: true, name: true, email: true } },
              journey: { select: { id: true, label: true, completedAt: true, createdAt: true } },
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
      })),
    }))
  )

  const rows = study.parts.flatMap((part) =>
    part.entries.map((entry) => ({
      entryId: entry.id,
      partId: part.id,
      partName: part.name,
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
    }))
  )

  const parts = study.parts.map((part) => ({ id: part.id, name: part.name, flow: part.flow }))
  const participants = study.participants.map((participant) => ({
    id: participant.user.id,
    name: participant.user.name,
    email: participant.user.email,
  }))

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <NavBar name={session.name} role="ADMIN" canSwitchModes />
      <StudyTabs studyId={id} active="analysis" studyName={study.name} isActive={study.isActive} status={study.status} />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <AnalysisDashboard
          studyId={id}
          studyName={study.name}
          includePilotByDefault={includePilotByDefault}
          parts={parts}
          participants={participants}
          questions={questions}
          rows={rows}
        />
      </main>
    </div>
  )
}
