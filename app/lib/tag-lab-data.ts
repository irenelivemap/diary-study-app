import 'server-only'

import { prisma } from '@/app/lib/db'
import { plainTextFromHtml } from '@/app/lib/sanitize-html'

export async function loadTagLabData(studyId: string, questionId: string) {
  const question = await prisma.question.findFirst({
    where: { id: questionId, studyId },
    include: { tagDefinitions: { orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] } },
  })

  if (!question || question.type !== 'FREE_TEXT') return null

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

  return {
    questionText: plainTextFromHtml(question.text),
    tagDefinitions: question.tagDefinitions.map((tag) => ({
      id: tag.id,
      label: tag.label,
      color: tag.color,
      parentId: tag.parentId ?? null,
      description: tag.description ?? null,
      sortOrder: tag.sortOrder,
      isTheme: tag.isTheme,
    })),
    answers: entries.flatMap((entry) => {
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
    }),
  }
}
