import { notFound } from 'next/navigation'
import { prisma } from '@/app/lib/db'
import TaggingWorkspace from '@/app/components/TaggingWorkspace'
import { plainTextFromHtml } from '@/app/lib/sanitize-html'

export default async function TaggingPage({ params }: { params: Promise<{ id: string; questionId: string }> }) {
  const { id, questionId } = await params

  const question = await prisma.question.findFirst({
    where: { id: questionId, studyId: id },
    include: { tagDefinitions: { orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] } },
  })

  if (!question || question.type !== 'FREE_TEXT') notFound()

  const entries = await prisma.entry.findMany({
    where: { partId: question.partId },
    include: {
      user: { select: { name: true, email: true } },
      answers: {
        where: { questionId },
        include: {
          tags: { include: { tag: true }, orderBy: { tag: { label: 'asc' } } },
        },
      },
    },
    orderBy: { submittedAt: 'desc' },
  })

  const tagDefinitions = question.tagDefinitions.map((tag) => ({
    id: tag.id,
    label: tag.label,
    color: tag.color,
    parentId: tag.parentId ?? null,
    description: tag.description ?? null,
    sortOrder: tag.sortOrder,
    isTheme: tag.isTheme,
  }))

  const answers = entries.flatMap((entry) => {
    const answer = entry.answers[0]
    if (!answer || answer.wasShown === false || !answer.value.trim()) return []
    return [{
      entryId: entry.id,
      participantName: entry.user.name,
      participantEmail: entry.user.email,
      date: entry.date,
      submittedAt: entry.submittedAt.toISOString(),
      answerId: answer.id,
      answer: answer.value,
      tags: answer.tags.map((answerTag) => ({
        id: answerTag.tag.id,
        label: answerTag.tag.label,
        color: answerTag.tag.color,
      })),
    }]
  })

  const questionText = plainTextFromHtml(question.text)

  return (
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <a
            href={`/admin/studies/${id}/analysis`}
            className="text-sm font-semibold text-[var(--text-link)]"
          >
            ← Back to analysis
          </a>
          <h1 className="mt-3 text-xl font-semibold text-[var(--text)]">{questionText}</h1>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">{answers.length} {answers.length === 1 ? 'answer' : 'answers'}</p>
        </div>
        <TaggingWorkspace
          studyId={id}
          questionId={questionId}
          initialTags={tagDefinitions}
          answers={answers}
        />
      </main>
  )
}
