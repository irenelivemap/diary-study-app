'use client'
/**
 * Drag-and-drop hook for reordering tags and moving them between themes.
 */

import { useEffect, useState } from 'react'
import {
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import type { InsertionIndicator, SaveNotice, TagDefinition } from '@/app/components/tag-lab/types'
import { sortTags, tagGroup } from '@/app/components/tag-lab/utils'

export function useTagDragReorder({
  tagDefinitions,
  selectedTagIds,
  onReorderTags,
  onExpandTheme,
}: {
  tagDefinitions: TagDefinition[]
  selectedTagIds: Set<string>
  onReorderTags: (orderedTagIds: string[], parentId: string | null) => Promise<boolean>
  onExpandTheme: (themeId: string) => void
}) {
  const [insertionIndicator, setInsertionIndicator] = useState<InsertionIndicator>(null)
  const [themeDropTargetId, setThemeDropTargetId] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<SaveNotice>(null)
  const [landedTagIds, setLandedTagIds] = useState<Set<string>>(new Set())
  const [activeTagId, setActiveTagId] = useState<string | null>(null)
  const [activeDragIds, setActiveDragIds] = useState<string[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  )

  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args)
    return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args)
  }

  useEffect(() => {
    if (!saveNotice) return
    const timeout = window.setTimeout(() => setSaveNotice(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [saveNotice])

  useEffect(() => {
    if (landedTagIds.size === 0) return
    const timeout = window.setTimeout(() => setLandedTagIds(new Set()), 1800)
    return () => window.clearTimeout(timeout)
  }, [landedTagIds])

  function dragIdsFor(tagId: string) {
    return selectedTagIds.has(tagId)
      ? sortTags(tagDefinitions.filter((tag) => selectedTagIds.has(tag.id))).map((tag) => tag.id)
      : [tagId]
  }

  function saveReorder(orderedTagIds: string[], parentId: string | null) {
    void onReorderTags(orderedTagIds, parentId).then((ok) => {
      if (!ok) setSaveNotice({ tone: 'error', message: 'Could not save tag order. The list was restored.' })
    })
  }

  function markLanded(tagIds: string[]) {
    setLandedTagIds(new Set(tagIds))
  }

  function moveBlockToParent(dragIds: string[], parentId: string | null, insertAt?: { overTagId: string; position: 'before' | 'after' }) {
    const dragged = sortTags(tagDefinitions.filter((tag) => dragIds.includes(tag.id)))
    if (dragged.length === 0) return
    const group = tagGroup(tagDefinitions, parentId).filter((tag) => !dragIds.includes(tag.id))
    let insertIndex = group.length
    if (insertAt) {
      const overIndex = group.findIndex((tag) => tag.id === insertAt.overTagId)
      if (overIndex === -1) return
      insertIndex = overIndex + (insertAt.position === 'after' ? 1 : 0)
    }
    const next = [...group]
    next.splice(insertIndex, 0, ...dragged.map((tag) => ({ ...tag, parentId })))
    markLanded(dragIds)
    saveReorder(next.map((tag) => tag.id), parentId)
  }

  function handleKeyboardReorder(tagId: string, direction: 'up' | 'down') {
    const tag = tagDefinitions.find((item) => item.id === tagId)
    if (!tag) return
    const group = tagGroup(tagDefinitions, tag.parentId)
    const index = group.findIndex((item) => item.id === tagId)
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || nextIndex < 0 || nextIndex >= group.length) return
    const next = [...group]
    const [moved] = next.splice(index, 1)
    next.splice(nextIndex, 0, moved)
    markLanded([tagId])
    setSaveNotice({ tone: 'success', message: `Moved ${tag.label} ${direction}.` })
    saveReorder(next.map((item) => item.id), tag.parentId)
  }

  function insertionFromDrag(event: DragOverEvent | DragEndEvent): InsertionIndicator {
    const { active, over } = event
    if (!over) return null
    const tagId = String(active.id).replace(/^tag-/, '')
    const dest = String(over.id)
    if (!dest.startsWith('row-')) return null
    const overTagId = dest.replace(/^row-/, '')
    if (activeDragIds.includes(overTagId) || overTagId === tagId) return null
    const activeRect = active.rect.current.translated
    const activeCenter = activeRect ? activeRect.top + activeRect.height / 2 : over.rect.top
    const overCenter = over.rect.top + over.rect.height / 2
    return { tagId: overTagId, position: activeCenter > overCenter ? 'after' : 'before' }
  }

  function handleDragStart(event: DragStartEvent) {
    const tagId = String(event.active.id).replace(/^tag-/, '')
    setActiveTagId(tagId)
    setActiveDragIds(dragIdsFor(tagId))
    setSaveNotice(null)
  }

  function handleDragOver(event: DragOverEvent) {
    const dest = event.over ? String(event.over.id) : ''
    setThemeDropTargetId(dest.startsWith('theme-') ? dest.replace(/^theme-/, '') : null)
    setInsertionIndicator(insertionFromDrag(event))
  }

  function handleDragCancel() {
    setActiveTagId(null)
    setActiveDragIds([])
    setThemeDropTargetId(null)
    setInsertionIndicator(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTagId(null)
    const dragIds = activeDragIds.length > 0 ? activeDragIds : [String(event.active.id).replace(/^tag-/, '')]
    setActiveDragIds([])
    setInsertionIndicator(null)
    setThemeDropTargetId(null)
    const { active, over } = event
    if (!over) return
    const tagId = String(active.id).replace(/^tag-/, '')
    const dest = String(over.id)
    const activeTag = tagDefinitions.find((tag) => tag.id === tagId)
    if (!activeTag) return

    if (dest.startsWith('row-')) {
      const overTagId = dest.replace(/^row-/, '')
      if (dragIds.includes(overTagId) || overTagId === tagId) return
      const overTag = tagDefinitions.find((tag) => tag.id === overTagId)
      if (!overTag) return

      const parentId = overTag.parentId
      if (parentId) onExpandTheme(parentId)
      const position = insertionFromDrag(event)?.position ?? 'after'
      moveBlockToParent(dragIds, parentId, { overTagId, position })
      return
    }

    if (dest === 'ungrouped' || dest.startsWith('theme-')) {
      const parentId = dest === 'ungrouped' ? null : dest.replace(/^theme-/, '')
      if (parentId) {
        const themeName = tagDefinitions.find((tag) => tag.id === parentId)?.label ?? 'theme'
        onExpandTheme(parentId)
        setSaveNotice({ tone: 'success', message: `Moved ${dragIds.length === 1 ? activeTag.label : `${dragIds.length} tags`} to ${themeName}.` })
      } else {
        setSaveNotice({ tone: 'success', message: `Moved ${dragIds.length === 1 ? activeTag.label : `${dragIds.length} tags`} back to Tags.` })
      }
      moveBlockToParent(dragIds, parentId)
    }
  }

  return {
    sensors,
    collisionDetection,
    insertionIndicator,
    themeDropTargetId,
    saveNotice,
    landedTagIds,
    activeTagId,
    activeDragIds,
    handleKeyboardReorder,
    handleDragStart,
    handleDragOver,
    handleDragCancel,
    handleDragEnd,
  }
}
