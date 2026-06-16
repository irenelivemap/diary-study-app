'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/db'
import { getSession } from '@/app/lib/session'

async function requireAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')
  return session
}

const DEFAULT_TAG_COLOR = '#4f46e5'
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

function cleanLabel(label: string) {
  return label.trim().replace(/\s+/g, ' ').slice(0, 40)
}

function cleanColor(color: string) {
  return COLOR_RE.test(color) ? color : DEFAULT_TAG_COLOR
}

function cleanTagIds(tagIds: string[]) {
  return Array.from(
    new Set(
      tagIds
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ).slice(0, 12)
}

export async function createQuestionTag(studyId: string, questionId: string, label: string, color = DEFAULT_TAG_COLOR) {
  await requireAdmin()

  const question = await prisma.question.findFirst({
    where: { id: questionId, studyId, type: 'FREE_TEXT' },
    select: { id: true },
  })
  if (!question) return { error: 'Question not found.' }

  const finalLabel = cleanLabel(label)
  if (!finalLabel) return { error: 'Tag label is required.' }

  const tag = await prisma.questionTag.upsert({
    where: { questionId_label: { questionId, label: finalLabel } },
    update: { color: cleanColor(color) },
    create: { questionId, label: finalLabel, color: cleanColor(color) },
  })

  revalidatePath(`/admin/studies/${studyId}/analysis`)
  return { success: true, tag }
}

export async function updateQuestionTag(studyId: string, tagId: string, data: { label?: string; color?: string }) {
  await requireAdmin()

  const tag = await prisma.questionTag.findFirst({
    where: { id: tagId, question: { studyId, type: 'FREE_TEXT' } },
    select: { id: true, questionId: true, label: true, color: true },
  })
  if (!tag) return { error: 'Tag not found.' }

  const label = data.label == null ? tag.label : cleanLabel(data.label)
  if (!label) return { error: 'Tag label is required.' }

  const updated = await prisma.questionTag.update({
    where: { id: tagId },
    data: {
      label,
      color: data.color == null ? tag.color : cleanColor(data.color),
    },
  })

  revalidatePath(`/admin/studies/${studyId}/analysis`)
  return { success: true, tag: updated }
}

export async function deleteQuestionTag(studyId: string, tagId: string) {
  await requireAdmin()

  const tag = await prisma.questionTag.findFirst({
    where: { id: tagId, question: { studyId, type: 'FREE_TEXT' } },
    select: { id: true },
  })
  if (!tag) return { error: 'Tag not found.' }

  await prisma.questionTag.delete({ where: { id: tagId } })
  revalidatePath(`/admin/studies/${studyId}/analysis`)
  return { success: true }
}

export async function updateAnswerTags(studyId: string, answerId: string, tagIds: string[]) {
  await requireAdmin()

  const answer = await prisma.answer.findFirst({
    where: { id: answerId, entry: { studyId }, question: { type: 'FREE_TEXT' } },
    select: { id: true, questionId: true },
  })
  if (!answer) return { error: 'Answer not found.' }

  const finalTagIds = cleanTagIds(tagIds)
  const allowedTags = await prisma.questionTag.findMany({
    where: { questionId: answer.questionId, id: { in: finalTagIds } },
    select: { id: true },
  })
  const allowedTagIds = allowedTags.map((tag) => tag.id)

  await prisma.$transaction([
    prisma.answerTag.deleteMany({ where: { answerId } }),
    ...(allowedTagIds.length
      ? [
          prisma.answerTag.createMany({
            data: allowedTagIds.map((tagId) => ({ answerId, tagId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ])

  revalidatePath(`/admin/studies/${studyId}/analysis`)
  return { success: true, tagIds: allowedTagIds }
}

export async function mergeQuestionTags(
  studyId: string,
  questionId: string,
  sourceTagIds: string[],
  resultLabel: string,
  resultColor: string = DEFAULT_TAG_COLOR,
) {
  await requireAdmin()

  if (!sourceTagIds.length) return { error: 'No tags to merge.' }

  const finalLabel = cleanLabel(resultLabel)
  if (!finalLabel) return { error: 'Tag label is required.' }

  const sourceTags = await prisma.questionTag.findMany({
    where: { id: { in: sourceTagIds }, questionId, question: { studyId, type: 'FREE_TEXT' } },
    select: { id: true },
  })
  if (sourceTags.length !== sourceTagIds.length) return { error: 'Some tags not found.' }

  const targetTag = await prisma.questionTag.upsert({
    where: { questionId_label: { questionId, label: finalLabel } },
    update: { color: cleanColor(resultColor) },
    create: { questionId, label: finalLabel, color: cleanColor(resultColor) },
  })

  const affected = await prisma.answerTag.findMany({
    where: { tagId: { in: sourceTagIds }, answer: { entry: { studyId } } },
    select: { answerId: true },
  })
  const affectedAnswerIds = [...new Set(affected.map((r) => r.answerId))]

  if (affectedAnswerIds.length > 0) {
    await prisma.$transaction([
      prisma.answerTag.deleteMany({
        where: { tagId: { in: sourceTagIds }, answerId: { in: affectedAnswerIds } },
      }),
      prisma.answerTag.createMany({
        data: affectedAnswerIds.map((answerId) => ({ answerId, tagId: targetTag.id })),
        skipDuplicates: true,
      }),
    ])
  }

  const toDelete = sourceTagIds.filter((id) => id !== targetTag.id)
  if (toDelete.length > 0) {
    await prisma.questionTag.deleteMany({ where: { id: { in: toDelete } } })
  }

  revalidatePath(`/admin/studies/${studyId}/analysis`)
  revalidatePath(`/admin/studies/${studyId}/analysis/${questionId}/tag`)
  return { success: true, tag: targetTag }
}
