'use client'
/**
 * Client-side data state and derived values for the tag lab.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createQuestionTag,
  deleteQuestionTag,
  reorderQuestionTags,
  setTagParent,
  suggestTagsBatchWithAI,
  updateAnswerTags,
  updateQuestionTag,
  updateTagDescription,
} from '@/app/actions/analysis'
import type { Answer, TagDefinition } from '@/app/components/tag-lab/types'
import { DEFAULT_COLORS, isThemeTag, normalizeLabel, sortTags } from '@/app/components/tag-lab/utils'

export type BatchSummary = { total: number; tagsApplied: number; firstError?: string } | null

export function useTagLabData({
  studyId,
  questionId,
  initialTags,
  answers,
}: {
  studyId: string
  questionId: string
  initialTags: TagDefinition[]
  answers: Answer[]
}) {
  const router = useRouter()
  const [tagDefinitions, setTagDefinitions] = useState<TagDefinition[]>(initialTags)
  const [tagIdsByAnswer, setTagIdsByAnswer] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(answers.map((answer) => [answer.answerId, answer.tags.map((tag) => tag.id)]))
  )
  const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null)
  const [savingTagId, setSavingTagId] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState<'apply' | 'explore'>('explore')
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 })
  const [batchSummary, setBatchSummary] = useState<BatchSummary>(null)
  const liveTagsRef = useRef<TagDefinition[]>(initialTags)

  const tagById = useMemo(() => new Map(tagDefinitions.map((tag) => [tag.id, tag])), [tagDefinitions])

  useEffect(() => {
    liveTagsRef.current = tagDefinitions
  }, [tagDefinitions])

  async function saveAnswerTags(answerId: string, nextTagIds: string[]) {
    const final = [...new Set(nextTagIds)].filter((id) => tagById.has(id)).slice(0, 12)
    setTagIdsByAnswer((prev) => ({ ...prev, [answerId]: final }))
    setSavingAnswerId(answerId)
    const result = await updateAnswerTags(studyId, answerId, final)
    setSavingAnswerId(null)
    if (result?.tagIds) setTagIdsByAnswer((prev) => ({ ...prev, [answerId]: result.tagIds }))
  }

  async function applyTag(answerId: string, tagId: string) {
    const current = tagIdsByAnswer[answerId] ?? []
    if (current.includes(tagId)) return
    await saveAnswerTags(answerId, [...current, tagId])
  }

  async function createAndApplyTag(answerId: string, label: string) {
    const color = DEFAULT_COLORS[tagDefinitions.length % DEFAULT_COLORS.length]
    setSavingTagId('new')
    const result = await createQuestionTag(studyId, questionId, normalizeLabel(label), color)
    setSavingTagId(null)
    if (!result?.tag) return
    const newTag: TagDefinition = {
      id: result.tag.id,
      label: result.tag.label,
      color: result.tag.color,
      parentId: null,
      description: null,
      sortOrder: result.tag.sortOrder,
      isTheme: result.tag.isTheme,
    }
    setTagDefinitions((prev) => {
      const without = prev.filter((tag) => tag.id !== newTag.id && tag.label !== newTag.label)
      return sortTags([...without, newTag])
    })
    const current = tagIdsByAnswer[answerId] ?? []
    if (!current.includes(newTag.id)) {
      const nextIds = [...current, newTag.id]
      setTagIdsByAnswer((prev) => ({ ...prev, [answerId]: nextIds }))
      setSavingAnswerId(answerId)
      const saveResult = await updateAnswerTags(studyId, answerId, nextIds)
      setSavingAnswerId(null)
      if (saveResult?.tagIds) setTagIdsByAnswer((prev) => ({ ...prev, [answerId]: saveResult.tagIds }))
    }
    router.refresh()
  }

  async function removeTag(answerId: string, tagId: string) {
    await saveAnswerTags(answerId, (tagIdsByAnswer[answerId] ?? []).filter((id) => id !== tagId))
  }

  async function createTag(label: string, color: string, isTheme = false): Promise<TagDefinition | null> {
    const finalLabel = normalizeLabel(label)
    if (!finalLabel) return null
    setSavingTagId('new')
    const result = await createQuestionTag(studyId, questionId, finalLabel, color, isTheme)
    setSavingTagId(null)
    if (!result?.tag) return null
    const newTag: TagDefinition = {
      id: result.tag.id,
      label: result.tag.label,
      color: result.tag.color,
      parentId: null,
      description: null,
      sortOrder: result.tag.sortOrder,
      isTheme: result.tag.isTheme,
    }
    setTagDefinitions((prev) => {
      const without = prev.filter((tag) => tag.id !== newTag.id && tag.label !== newTag.label)
      return sortTags([...without, newTag])
    })
    router.refresh()
    return newTag
  }

  async function renameTag(tagId: string, label: string, color: string) {
    setSavingTagId(tagId)
    const result = await updateQuestionTag(studyId, tagId, { label, color })
    setSavingTagId(null)
    if (result?.tag) {
      setTagDefinitions((prev) =>
        prev
          .map((tag) => tag.id === tagId ? { ...tag, label: result.tag.label, color: result.tag.color } : tag)
          .sort((a, b) => (a.parentId ?? '').localeCompare(b.parentId ?? '') || (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label))
      )
      router.refresh()
    }
  }

  async function deleteTag(tagId: string, mode?: 'keep-subtags' | 'delete-all') {
    setSavingTagId(tagId)
    if (mode === 'keep-subtags') {
      const children = tagDefinitions.filter((tag) => tag.parentId === tagId)
      for (const child of children) {
        await setTagParent(studyId, child.id, null)
      }
      setTagDefinitions((prev) => prev.map((tag) => tag.parentId === tagId ? { ...tag, parentId: null } : tag))
    } else if (mode === 'delete-all') {
      const children = tagDefinitions.filter((tag) => tag.parentId === tagId)
      for (const child of children) {
        await deleteQuestionTag(studyId, child.id)
      }
      setTagDefinitions((prev) => prev.filter((tag) => tag.parentId !== tagId))
      setTagIdsByAnswer((prev) =>
        Object.fromEntries(Object.entries(prev).map(([answerId, ids]) => [answerId, ids.filter((id) => !children.some((child) => child.id === id))]))
      )
    }
    const result = await deleteQuestionTag(studyId, tagId)
    setSavingTagId(null)
    if (result?.success) {
      setTagDefinitions((prev) => prev.filter((tag) => tag.id !== tagId))
      setTagIdsByAnswer((prev) =>
        Object.fromEntries(Object.entries(prev).map(([answerId, ids]) => [answerId, ids.filter((id) => id !== tagId)]))
      )
      router.refresh()
    }
  }

  async function moveTagToTheme(tagId: string, parentId: string | null) {
    const result = await setTagParent(studyId, tagId, parentId)
    if (result?.success) {
      setTagDefinitions((prev) => prev.map((tag) => tag.id === tagId ? { ...tag, parentId } : tag))
      router.refresh()
    }
  }

  async function reorderTags(orderedTagIds: string[], parentId: string | null) {
    const previous = tagDefinitions
    const orderById = new Map(orderedTagIds.map((id, index) => [id, index * 1000]))
    setTagDefinitions((prev) => prev.map((tag) => (
      orderById.has(tag.id)
        ? { ...tag, parentId, sortOrder: orderById.get(tag.id)! }
        : tag
    )))

    const result = await reorderQuestionTags(studyId, questionId, orderedTagIds, parentId)
    if (result?.success) {
      router.refresh()
      return true
    }

    setTagDefinitions(previous)
    return false
  }

  async function updateDescription(tagId: string, description: string) {
    const result = await updateTagDescription(studyId, tagId, description)
    if (result?.success) {
      setTagDefinitions((prev) => prev.map((tag) => tag.id === tagId ? { ...tag, description: description || null } : tag))
    }
  }

  async function runBatchTag(answerIds: string[], modeOverride?: 'apply' | 'explore') {
    const batchSize = 15
    const concurrency = 5
    const targetIds = new Set(answerIds)
    const toProcess = answers.filter((answer) => targetIds.has(answer.answerId))
    if (!toProcess.length) return
    const mode = modeOverride ?? batchMode

    setBatchRunning(true)
    setBatchSummary(null)
    setBatchProgress({ done: 0, total: toProcess.length })

    const batches: typeof toProcess[] = []
    for (let i = 0; i < toProcess.length; i += batchSize) batches.push(toProcess.slice(i, i + batchSize))

    let tagsApplied = 0
    let firstError: string | undefined

    for (let i = 0; i < batches.length; i += concurrency) {
      const round = batches.slice(i, i + concurrency)
      const tagSnapshot = liveTagsRef.current.filter((tag) => !isThemeTag(tag))

      await Promise.all(round.map(async (batch) => {
        const result = await suggestTagsBatchWithAI(
          batch.map((answer) => ({ id: answer.answerId, text: answer.answer })),
          tagSnapshot.map((tag) => ({ id: tag.id, label: tag.label })),
          mode,
        )

        if (result.error && !firstError) firstError = result.error

        for (const answer of batch) {
          const res = result.results[answer.answerId]
          if (!res) {
            setBatchProgress((progress) => ({ ...progress, done: progress.done + 1 }))
            continue
          }

          const existingIds = tagIdsByAnswer[answer.answerId] ?? []
          const validTagIds = new Set(tagSnapshot.map((tag) => tag.id))
          const toAdd = res.apply.filter((id) => validTagIds.has(id) && !existingIds.includes(id))
          const nextIds = [...existingIds, ...toAdd]

          for (const label of res.new_tags) {
            const color = DEFAULT_COLORS[liveTagsRef.current.length % DEFAULT_COLORS.length]
            const tagResult = await createQuestionTag(studyId, questionId, normalizeLabel(label), color)
            if (tagResult?.tag) {
              const newTag: TagDefinition = {
                id: tagResult.tag.id,
                label: tagResult.tag.label,
                color: tagResult.tag.color,
                parentId: null,
                description: null,
                sortOrder: tagResult.tag.sortOrder,
                isTheme: tagResult.tag.isTheme,
              }
              const updated = sortTags([...liveTagsRef.current.filter((tag) => tag.id !== newTag.id && tag.label !== newTag.label), newTag])
              liveTagsRef.current = updated
              setTagDefinitions(updated)
              if (!nextIds.includes(newTag.id)) nextIds.push(newTag.id)
            }
          }

          if (nextIds.length > existingIds.length) {
            tagsApplied += nextIds.length - existingIds.length
            setTagIdsByAnswer((prev) => ({ ...prev, [answer.answerId]: nextIds }))
            await updateAnswerTags(studyId, answer.answerId, nextIds)
          }

          setBatchProgress((progress) => ({ ...progress, done: progress.done + 1 }))
        }
      }))
    }

    setBatchRunning(false)
    setBatchSummary({ total: toProcess.length, tagsApplied, firstError })
    router.refresh()
  }

  return {
    tagDefinitions,
    tagIdsByAnswer,
    tagById,
    savingAnswerId,
    savingTagId,
    batchMode,
    setBatchMode,
    batchRunning,
    batchProgress,
    batchSummary,
    clearBatchSummary: () => setBatchSummary(null),
    applyTag,
    createAndApplyTag,
    removeTag,
    createTag,
    renameTag,
    deleteTag,
    moveTagToTheme,
    reorderTags,
    updateDescription,
    runBatchTag,
  }
}
