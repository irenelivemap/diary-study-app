import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import AnalysisDashboard from '@/app/components/AnalysisDashboard'
import NavBar from '@/app/components/NavBar'
import StudyTabs from '@/app/components/StudyTabs'

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')

  const { id } = await params
  const study = await prisma.study.findUnique({
    where: { id },
    include: {
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

  const questions = study.parts.flatMap((part) =>
    part.questions.map((question) => ({
      id: question.id,
      partId: part.id,
      partName: part.name,
      text: question.text.replace(/<[^>]*>/g, ''),
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
      date: entry.date,
      submittedAt: entry.submittedAt.toISOString(),
      timezone: entry.timezone,
      answers: Object.fromEntries(entry.answers.map((answer) => [
        answer.questionId,
        {
          id: answer.id,
          value: answer.value,
          tags: answer.tags.map((answerTag) => ({
            id: answerTag.tag.id,
            label: answerTag.tag.label,
            color: answerTag.tag.color,
          })),
        },
      ])),
    }))
  )

  const parts = study.parts.map((part) => ({ id: part.id, name: part.name }))
  const participants = Array.from(
    new Map(
      rows.map((row) => [
        row.participantId,
        { id: row.participantId, name: row.participantName, email: row.participantEmail },
      ])
    ).values()
  )

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar name={session.name} role="ADMIN" canSwitchModes />
      <StudyTabs studyId={id} active="analysis" studyName={study.name} isActive={study.isActive} />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
        <AnalysisDashboard
          studyId={id}
          studyName={study.name}
          parts={parts}
          participants={participants}
          questions={questions}
          rows={rows}
        />
      </main>
    </div>
  )
}
