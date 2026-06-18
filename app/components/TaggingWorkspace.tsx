'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import {
  consolidateTagsWithAI,
  createQuestionTag,
  deleteQuestionTag,
  reorderQuestionTags,
  setTagParent,
  suggestTagsBatchWithAI,
  suggestThemeName,
  updateAnswerTags,
  updateQuestionTag,
  updateTagDescription,
} from '@/app/actions/analysis'
import { Button } from '@/app/components/ui'
import AIProposalPanel from '@/app/components/tag-lab/AIProposalPanel'
import AnswerPanel from '@/app/components/tag-lab/AnswerPanel'
import { ManageCtx, TagDragOverlay, TagRow, UngroupedDropZone } from '@/app/components/tag-lab/ManageTagRows'
import type { ManageCtxType } from '@/app/components/tag-lab/ManageTagRows'
import { AiErrorMessage, SaveNoticeMessage, SelectedTagsGroupingBar } from '@/app/components/tag-lab/OrganizationFeedback'
import TagAnswers from '@/app/components/tag-lab/TagAnswers'
import type { Answer, InsertionIndicator, ProposedTheme, SaveNotice, TagDefinition } from '@/app/components/tag-lab/types'
import TagCreateRow from '@/app/components/tag-lab/TagCreateRow'
import { BulkDeleteConfirm, TagSectionHeader } from '@/app/components/tag-lab/TagSectionControls'
import ThemeCard from '@/app/components/tag-lab/ThemeCard'
import { DEFAULT_COLORS, isThemeTag, normalizeLabel, sortTags, tagGroup } from '@/app/components/tag-lab/utils'

// ─── AnalysisWorkspace ───────────────────────────────────────────────────────

function AnalysisWorkspace({
  studyId,
  questionId,
  tagDefinitions,
  tagIdsByAnswer,
  answers,
  tagById,
  savingAnswerId,
  savingTagId,
  batchRunning,
  batchProgress,
  batchSummary,
  batchMode,
  setBatchMode,
  onRunBatch,
  onClearBatchSummary,
  onApply,
  onCreateAndApply,
  onRemove,
  onRename,
  onDelete,
  onCreate,
  onMoveToTheme,
  onReorderTags,
  onUpdateDescription,
}: {
  studyId: string
  questionId: string
  tagDefinitions: TagDefinition[]
  tagIdsByAnswer: Record<string, string[]>
  answers: Answer[]
  tagById: Map<string, TagDefinition>
  savingAnswerId: string | null
  savingTagId: string | null
  batchRunning: boolean
  batchProgress: { done: number; total: number }
  batchSummary: { total: number; tagsApplied: number; firstError?: string } | null
  batchMode: 'apply' | 'explore'
  setBatchMode: (m: 'apply' | 'explore') => void
  onRunBatch: (answerIds: string[], modeOverride?: 'apply' | 'explore') => void
  onClearBatchSummary: () => void
  onApply: (answerId: string, tagId: string) => void
  onCreateAndApply: (answerId: string, label: string) => void
  onRemove: (answerId: string, tagId: string) => void
  onRename: (tagId: string, label: string, color: string) => void
  onDelete: (tagId: string, mode?: 'keep-subtags' | 'delete-all') => void
  onCreate: (label: string, color: string, isTheme?: boolean) => Promise<TagDefinition | null>
  onMoveToTheme: (tagId: string, parentId: string | null) => Promise<void>
  onReorderTags: (orderedTagIds: string[], parentId: string | null) => Promise<boolean>
  onUpdateDescription: (tagId: string, description: string) => Promise<void>
}) {
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0])
  const [newThemeLabel, setNewThemeLabel] = useState('')
  const [newThemeColor, setNewThemeColor] = useState(DEFAULT_COLORS[1])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [editingDescId, setEditingDescId] = useState<string | null>(null)
  const [descValue, setDescValue] = useState('')
  const [consolidating, setConsolidating] = useState(false)
  const [aiProposal, setAiProposal] = useState<ProposedTheme[] | null>(null)
  const [aiProposalScope, setAiProposalScope] = useState<Set<string>>(new Set())
  const [aiError, setAiError] = useState<string | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [selectedThemeIds, setSelectedThemeIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'idle' | 'confirm-delete' | 'grouping'>('idle')
  const [themeBulkAction, setThemeBulkAction] = useState<'idle' | 'confirm-delete'>('idle')
  const [groupName, setGroupName] = useState('')
  const [namingSuggesting, setNamingSuggesting] = useState(false)
  const [expandedTagIds, setExpandedTagIds] = useState<Set<string>>(new Set())
  const [expandedThemeIds, setExpandedThemeIds] = useState<Set<string>>(new Set())
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

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ids of Object.values(tagIdsByAnswer)) {
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
  }, [tagIdsByAnswer])
  const themes = useMemo(() => sortTags(tagDefinitions.filter((t) => isThemeTag(t))), [tagDefinitions])
  const ungroupedTags = useMemo(() => sortTags(tagDefinitions.filter((t) => t.parentId === null && !isThemeTag(t))), [tagDefinitions])
  const topicTags = useMemo(() => sortTags(tagDefinitions.filter((t) => !isThemeTag(t))), [tagDefinitions])
  const selectedTopicIds = useMemo(() => topicTags.filter((tag) => selectedTagIds.has(tag.id)).map((tag) => tag.id), [selectedTagIds, topicTags])
  const allTopicsSelected = topicTags.length > 0 && topicTags.every((tag) => selectedTagIds.has(tag.id))
  const someTopicsSelected = topicTags.some((tag) => selectedTagIds.has(tag.id))
  const allThemesSelected = themes.length > 0 && themes.every((theme) => selectedThemeIds.has(theme.id))
  const someThemesSelected = themes.some((theme) => selectedThemeIds.has(theme.id))

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

  function toggleTagExpand(id: string) {
    setExpandedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleThemeExpand(id: string) {
    setExpandedThemeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleSelect(tagId: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }
  function toggleSelectAllTopics() {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (allTopicsSelected) {
        for (const tag of topicTags) next.delete(tag.id)
      } else {
        for (const tag of topicTags) next.add(tag.id)
      }
      return next
    })
    setBulkAction('idle')
  }
  function toggleThemeSelect(themeId: string) {
    setSelectedThemeIds((prev) => {
      const next = new Set(prev)
      if (next.has(themeId)) next.delete(themeId)
      else next.add(themeId)
      return next
    })
    setThemeBulkAction('idle')
  }
  function toggleSelectAllThemes() {
    setSelectedThemeIds((prev) => {
      const next = new Set(prev)
      if (allThemesSelected) {
        for (const theme of themes) next.delete(theme.id)
      } else {
        for (const theme of themes) next.add(theme.id)
      }
      return next
    })
    setThemeBulkAction('idle')
  }
  function clearSelection() { setSelectedTagIds(new Set()); setBulkAction('idle'); setGroupName('') }
  function clearThemeSelection() { setSelectedThemeIds(new Set()); setThemeBulkAction('idle') }

  async function handleBulkDelete() {
    for (const id of Array.from(selectedTagIds)) await onDelete(id, tagDefinitions.some((c) => c.parentId === id) ? 'keep-subtags' : undefined)
    clearSelection()
  }
  async function handleBulkDeleteThemes() {
    for (const id of Array.from(selectedThemeIds)) await onDelete(id, 'keep-subtags')
    clearThemeSelection()
  }
  async function handleGroupSelected() {
    const label = normalizeLabel(groupName); if (!label) return
    const result = await createQuestionTag(studyId, questionId, label, DEFAULT_COLORS[tagDefinitions.length % DEFAULT_COLORS.length], true)
    if (!result?.tag) return
    for (const tagId of Array.from(selectedTagIds)) await onMoveToTheme(tagId, result.tag.id)
    clearSelection()
  }
  async function handleSuggestGroupName() {
    const labels = Array.from(selectedTagIds).map((id) => tagDefinitions.find((t) => t.id === id)?.label ?? '').filter(Boolean)
    if (!labels.length) return
    setNamingSuggesting(true)
    const result = await suggestThemeName(labels)
    setNamingSuggesting(false)
    if ('name' in result && result.name) setGroupName(result.name)
  }
  async function handleBulkAiGroup() {
    const sel = topicTags.filter((t) => selectedTagIds.has(t.id)); if (sel.length < 2) return
    setConsolidating(true); setAiError(null); setAiProposal(null)
    const result = await consolidateTagsWithAI(studyId, questionId, sel.map((t) => ({ id: t.id, label: t.label })))
    setConsolidating(false)
    if ('error' in result && result.error) { setAiError(result.error as string); return }
    if (result.themes.length === 0) { setAiError('AI returned no theme groupings.'); return }
    setAiProposalScope(new Set(sel.map((t) => t.id)))
    setAiProposal(result.themes.map((theme, i) => ({
      tempId: `temp-${i}-${Date.now()}`,
      name: theme.name,
      description: theme.description,
      tagIds: theme.tagIds,
      color: tagDefinitions.find((tag) => theme.tagIds.includes(tag.id))?.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    })))
    clearSelection()
  }
  async function handleCreate() {
    const label = normalizeLabel(newLabel); if (!label) return
    await onCreate(label, newColor)
    setNewLabel(''); setNewColor(DEFAULT_COLORS[tagDefinitions.length % DEFAULT_COLORS.length])
  }
  async function handleCreateTheme() {
    const label = normalizeLabel(newThemeLabel); if (!label) return
    const theme = await onCreate(label, newThemeColor, true)
    if (!theme) return
    setExpandedThemeIds((prev) => new Set(prev).add(theme.id))
    setNewThemeLabel('')
    setNewThemeColor(DEFAULT_COLORS[(tagDefinitions.length + 1) % DEFAULT_COLORS.length])
  }
  async function handleAiConsolidate() {
    const leafTags = tagDefinitions.filter((t) => t.parentId === null && !isThemeTag(t))
    if (leafTags.length < 2) return
    setConsolidating(true); setAiError(null); setAiProposal(null)
    const result = await consolidateTagsWithAI(studyId, questionId, leafTags.map((t) => ({ id: t.id, label: t.label })))
    setConsolidating(false)
    if ('error' in result && result.error) { setAiError(result.error as string); return }
    if (result.themes.length === 0) { setAiError('AI returned no theme groupings.'); return }
    setAiProposalScope(new Set(leafTags.map((t) => t.id)))
    setAiProposal(result.themes.map((theme, i) => ({
      tempId: `temp-${i}-${Date.now()}`,
      name: theme.name,
      description: theme.description,
      tagIds: theme.tagIds,
      color: tagDefinitions.find((tag) => theme.tagIds.includes(tag.id))?.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    })))
  }
  async function applyProposal(proposals: ProposedTheme[]) {
    for (const theme of proposals) {
      if (!theme.tagIds.length) continue
      // Use onCreate so the new theme is added to local tagDefinitions state immediately
      const newTheme = await onCreate(normalizeLabel(theme.name) || 'Theme', theme.color, true)
      if (!newTheme) continue
      for (const tagId of theme.tagIds) await onMoveToTheme(tagId, newTheme.id)
      if (theme.description) await onUpdateDescription(newTheme.id, theme.description)
    }
    setAiProposal(null)
  }
  function startRename(tag: TagDefinition) { setRenamingId(tag.id); setRenameValue(tag.label) }
  async function commitRename(tag: TagDefinition) {
    const label = normalizeLabel(renameValue)
    if (label && label !== tag.label) onRename(tag.id, label, tag.color)
    setRenamingId(null); setRenameValue('')
  }
  function startEditDesc(tag: TagDefinition) { setEditingDescId(tag.id); setDescValue(tag.description ?? '') }
  async function commitDesc(tagId: string) { await onUpdateDescription(tagId, descValue); setEditingDescId(null); setDescValue('') }
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
  function handleDragEnd(event: DragEndEvent) {
    setActiveTagId(null)
    const dragIds = activeDragIds.length > 0 ? activeDragIds : [String(event.active.id).replace(/^tag-/, '')]
    setActiveDragIds([])
    setInsertionIndicator(null)
    setThemeDropTargetId(null)
    const { active, over } = event; if (!over) return
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
      if (parentId) setExpandedThemeIds((prev) => new Set(prev).add(parentId))
      const position = insertionFromDrag(event)?.position ?? 'after'
      moveBlockToParent(dragIds, parentId, { overTagId, position })
      return
    }

    if (dest === 'ungrouped' || dest.startsWith('theme-')) {
      const parentId = dest === 'ungrouped' ? null : dest.replace(/^theme-/, '')
      if (parentId) {
        const themeName = tagDefinitions.find((tag) => tag.id === parentId)?.label ?? 'theme'
        setExpandedThemeIds((prev) => new Set(prev).add(parentId))
        setSaveNotice({ tone: 'success', message: `Moved ${dragIds.length === 1 ? activeTag.label : `${dragIds.length} tags`} to ${themeName}.` })
      } else {
        setSaveNotice({ tone: 'success', message: `Moved ${dragIds.length === 1 ? activeTag.label : `${dragIds.length} tags`} back to Tags.` })
      }
      moveBlockToParent(dragIds, parentId)
    }
  }

  const ctxValue: ManageCtxType = {
    selectedTagIds, toggleSelect,
    savingTagId, tagCounts, tagDefinitions,
    renamingId, renameValue, setRenameValue, setRenamingId, commitRename,
    editingDescId, descValue, setDescValue, setEditingDescId, commitDesc,
    onRename,
    startRename, startEditDesc,
    expandedTagIds, toggleTagExpand,
    insertionIndicator,
    activeDragIds,
    landedTagIds,
    onKeyboardReorder: handleKeyboardReorder,
  }

  return (
    <ManageCtx.Provider value={ctxValue}>
    <DndContext
      id="tag-lab-dnd"
      sensors={sensors}
      autoScroll
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragCancel={() => { setActiveTagId(null); setActiveDragIds([]); setThemeDropTargetId(null); setInsertionIndicator(null) }}
      onDragEnd={handleDragEnd}
    >
    <div className="space-y-4">

      {selectedTagIds.size > 0 && bulkAction === 'grouping' && (
        <SelectedTagsGroupingBar
          value={groupName}
          suggesting={namingSuggesting}
          onValueChange={setGroupName}
          onSuggestName={() => void handleSuggestGroupName()}
          onCreateTheme={() => void handleGroupSelected()}
          onCancel={() => setBulkAction('idle')}
        />
      )}

      <AiErrorMessage message={aiError} />
      <SaveNoticeMessage notice={saveNotice} />

      {/* Themes */}
      <div className="space-y-2">
        <TagSectionHeader
          itemCount={themes.length}
          checked={allThemesSelected}
          indeterminate={someThemesSelected && !allThemesSelected}
          emptyLabel="Themes"
          allLabel="All themes"
          checkboxLabel="Select all themes"
          selectedCount={themeBulkAction === 'idle' ? selectedThemeIds.size : 0}
          deleteLabel="Delete selected themes"
          indentClassName="pl-[52px]"
          onToggleAll={toggleSelectAllThemes}
          onDeleteSelected={() => setThemeBulkAction('confirm-delete')}
        />
        {themeBulkAction === 'confirm-delete' && (
          <BulkDeleteConfirm
            count={selectedThemeIds.size}
            noun="theme"
            detail="Tags will stay ungrouped."
            onConfirm={() => void handleBulkDeleteThemes()}
            onCancel={() => setThemeBulkAction('idle')}
          />
        )}
        {themes.length === 0 && !aiProposal ? (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-white px-5 py-9 text-center shadow-[var(--shadow-sm)]">
            <p className="text-sm font-semibold text-[var(--text-secondary)]">No themes yet.</p>
          </div>
        ) : themes.length > 0 ? (
          <div className="space-y-2">
            {themes.map((theme) => {
            const isOpen = expandedThemeIds.has(theme.id)
            const themeSelected = selectedThemeIds.has(theme.id)
            return (
              <ThemeCard
                key={theme.id}
                theme={theme}
                tagDefinitions={tagDefinitions}
                answers={answers}
                tagIdsByAnswer={tagIdsByAnswer}
                selected={themeSelected}
                expanded={isOpen}
                dropActive={themeDropTargetId === theme.id}
                renaming={renamingId === theme.id}
                renameValue={renameValue}
                editingDescription={editingDescId === theme.id}
                descriptionValue={descValue}
                expandedTagIds={expandedTagIds}
                onToggleExpand={() => toggleThemeExpand(theme.id)}
                onToggleSelect={() => toggleThemeSelect(theme.id)}
                onRenameColor={(color) => onRename(theme.id, theme.label, color)}
                onStartRename={() => startRename(theme)}
                onRenameValueChange={setRenameValue}
                onCommitRename={() => void commitRename(theme)}
                onCancelRename={() => { setRenamingId(null); setRenameValue('') }}
                onStartEditDescription={() => startEditDesc(theme)}
                onDescriptionValueChange={setDescValue}
                onCommitDescription={() => void commitDesc(theme.id)}
                onCancelDescription={() => setEditingDescId(null)}
                onRemoveAnswerTag={onRemove}
              />
            )
          })}
          </div>
        ) : null}
        {aiProposal && (
          <AIProposalPanel
            proposal={aiProposal}
            tagById={new Map(tagDefinitions.map((t) => [t.id, t]))}
            allTagIds={aiProposalScope}
            answers={answers} tagIdsByAnswer={tagIdsByAnswer}
            onApply={applyProposal}
            onCancel={() => setAiProposal(null)}
          />
        )}
      </div>

      <TagCreateRow
        value={newThemeLabel}
        color={newThemeColor}
        placeholder="New theme name"
        colorLabel="Theme color"
        buttonLabel="Add theme"
        busyLabel="Adding…"
        busy={savingTagId === 'new'}
        onValueChange={setNewThemeLabel}
        onColorChange={setNewThemeColor}
        onCreate={() => void handleCreateTheme()}
      />

      {/* Tags */}
      <div className="space-y-2">
        <TagSectionHeader
          itemCount={topicTags.length}
          checked={allTopicsSelected}
          indeterminate={someTopicsSelected && !allTopicsSelected}
          emptyLabel="Tags"
          allLabel="All tags"
          checkboxLabel="Select all tags"
          selectedCount={bulkAction === 'idle' ? selectedTagIds.size : 0}
          deleteLabel="Delete selected tags"
          indentClassName="pl-4"
          onToggleAll={toggleSelectAllTopics}
          onDeleteSelected={() => setBulkAction('confirm-delete')}
          rightAction={(topicTags.length > 0 || consolidating) && (
            <Button
              tone="secondary"
              size="sm"
              onClick={() => selectedTopicIds.length > 0 ? void handleBulkAiGroup() : void handleAiConsolidate()}
              disabled={consolidating || (selectedTopicIds.length > 0 ? selectedTopicIds.length < 2 : ungroupedTags.length < 2)}
              className="w-48 whitespace-nowrap"
            >
              {consolidating ? '✦ Grouping…' : selectedTopicIds.length > 0 ? '✦ AI group selected' : '✦ AI group all'}
            </Button>
          )}
        />
        {bulkAction === 'confirm-delete' && (
          <BulkDeleteConfirm
            count={selectedTagIds.size}
            noun="tag"
            onConfirm={() => void handleBulkDelete()}
            onCancel={() => setBulkAction('idle')}
          />
        )}
        <UngroupedDropZone>
          {aiProposal ? (
            <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-5 py-4 text-center text-sm text-[var(--text-tertiary)]">
              Tags remain available here. Drag a tag from a theme back into this area to ungroup it.
            </p>
          ) : ungroupedTags.length > 0 ? (
            ungroupedTags.map((tag) => (
              <div key={tag.id}>
                <TagRow tag={tag} />
                {expandedTagIds.has(tag.id) && <TagAnswers tag={tag} indent={false} answers={answers} tagIdsByAnswer={tagIdsByAnswer} onRemove={onRemove} />}
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-5 py-5 text-center text-sm text-[var(--text-tertiary)]">No tags yet.</p>
          )}
        </UngroupedDropZone>
      </div>

      <TagCreateRow
        value={newLabel}
        color={newColor}
        placeholder="New tag name"
        colorLabel="Tag color"
        buttonLabel="Add tag"
        busyLabel="Adding…"
        busy={savingTagId === 'new'}
        onValueChange={setNewLabel}
        onColorChange={setNewColor}
        onCreate={() => void handleCreate()}
      />

      <AnswerPanel
        answers={answers}
        tagDefinitions={tagDefinitions}
        tagIdsByAnswer={tagIdsByAnswer}
        tagById={tagById}
        savingAnswerId={savingAnswerId}
        savingTagId={savingTagId}
        batchRunning={batchRunning}
        batchProgress={batchProgress}
        batchSummary={batchSummary}
        batchMode={batchMode}
        setBatchMode={setBatchMode}
        onRunBatch={onRunBatch}
        onClearBatchSummary={onClearBatchSummary}
        onApply={onApply}
        onCreateAndApply={onCreateAndApply}
        onRemove={onRemove}
      />

    </div>
    <DragOverlay>
      {activeTagId && <TagDragOverlay tag={tagDefinitions.find((tag) => tag.id === activeTagId)} dragCount={activeDragIds.length} />}
    </DragOverlay>
    </DndContext>
    </ManageCtx.Provider>
  )
}

// ─── TaggingWorkspace ─────────────────────────────────────────────────────────

export default function TaggingWorkspace({
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
    Object.fromEntries(answers.map((a) => [a.answerId, a.tags.map((t) => t.id)]))
  )
  const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null)
  const [savingTagId, setSavingTagId] = useState<string | null>(null)

  const [batchMode, setBatchMode] = useState<'apply' | 'explore'>('explore')
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 })
  const [batchSummary, setBatchSummary] = useState<{ total: number; tagsApplied: number; firstError?: string } | null>(null)
  const liveTagsRef = useRef<TagDefinition[]>(initialTags)

  const tagById = useMemo(() => new Map(tagDefinitions.map((t) => [t.id, t])), [tagDefinitions])
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
      const without = prev.filter((t) => t.id !== newTag.id && t.label !== newTag.label)
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
      const without = prev.filter((t) => t.id !== newTag.id && t.label !== newTag.label)
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
        prev.map((t) => t.id === tagId ? { ...t, label: result.tag.label, color: result.tag.color } : t)
          .sort((a, b) => (a.parentId ?? '').localeCompare(b.parentId ?? '') || (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label))
      )
      router.refresh()
    }
  }

  async function deleteTag(tagId: string, mode?: 'keep-subtags' | 'delete-all') {
    setSavingTagId(tagId)
    if (mode === 'keep-subtags') {
      // Unparent all children first
      const children = tagDefinitions.filter((t) => t.parentId === tagId)
      for (const child of children) {
        await setTagParent(studyId, child.id, null)
      }
      setTagDefinitions((prev) => prev.map((t) => t.parentId === tagId ? { ...t, parentId: null } : t))
    } else if (mode === 'delete-all') {
      // Delete children first
      const children = tagDefinitions.filter((t) => t.parentId === tagId)
      for (const child of children) {
        await deleteQuestionTag(studyId, child.id)
      }
      setTagDefinitions((prev) => prev.filter((t) => t.parentId !== tagId))
      setTagIdsByAnswer((prev) =>
        Object.fromEntries(Object.entries(prev).map(([aid, ids]) => [aid, ids.filter((id) => !children.some((c) => c.id === id))]))
      )
    }
    const result = await deleteQuestionTag(studyId, tagId)
    setSavingTagId(null)
    if (result?.success) {
      setTagDefinitions((prev) => prev.filter((t) => t.id !== tagId))
      setTagIdsByAnswer((prev) =>
        Object.fromEntries(Object.entries(prev).map(([aid, ids]) => [aid, ids.filter((id) => id !== tagId)]))
      )
      router.refresh()
    }
  }

  async function moveTagToTheme(tagId: string, parentId: string | null) {
    const result = await setTagParent(studyId, tagId, parentId)
    if (result?.success) {
      setTagDefinitions((prev) => prev.map((t) => t.id === tagId ? { ...t, parentId } : t))
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
    } else {
      setTagDefinitions(previous)
      return false
    }
  }

  async function updateDescription(tagId: string, description: string) {
    const result = await updateTagDescription(studyId, tagId, description)
    if (result?.success) {
      setTagDefinitions((prev) => prev.map((t) => t.id === tagId ? { ...t, description: description || null } : t))
    }
  }

  async function runBatchTag(answerIds: string[], modeOverride?: 'apply' | 'explore') {
    const BATCH_SIZE = 15  // answers per AI call
    const CONCURRENCY = 5  // parallel AI calls at once

    const targetIds = new Set(answerIds)
    const toProcess = answers.filter((a) => targetIds.has(a.answerId))
    if (!toProcess.length) return
    const mode = modeOverride ?? batchMode

    setBatchRunning(true)
    setBatchSummary(null)
    setBatchProgress({ done: 0, total: toProcess.length })

    // Split into batches
    const batches: typeof toProcess[] = []
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) batches.push(toProcess.slice(i, i + BATCH_SIZE))

    let tagsApplied = 0
    let firstError: string | undefined

    // Process batches with limited concurrency
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const round = batches.slice(i, i + CONCURRENCY)
      const tagSnapshot = liveTagsRef.current.filter((t) => !isThemeTag(t))

      await Promise.all(round.map(async (batch) => {
        const result = await suggestTagsBatchWithAI(
          batch.map((a) => ({ id: a.answerId, text: a.answer })),
          tagSnapshot.map((t) => ({ id: t.id, label: t.label })),
          mode,
        )

        if (result.error && !firstError) firstError = result.error

        for (const answer of batch) {
          const res = result.results[answer.answerId]
          if (!res) { setBatchProgress((p) => ({ ...p, done: p.done + 1 })); continue }

          const existingIds = tagIdsByAnswer[answer.answerId] ?? []
          const validTagIds = new Set(tagSnapshot.map((t) => t.id))
          const toAdd = res.apply.filter((id) => validTagIds.has(id) && !existingIds.includes(id))
          const nextIds = [...existingIds, ...toAdd]

          for (const label of res.new_tags) {
            const color = DEFAULT_COLORS[liveTagsRef.current.length % DEFAULT_COLORS.length]
            const tagResult = await createQuestionTag(studyId, questionId, normalizeLabel(label), color)
            if (tagResult?.tag) {
              const newTag: TagDefinition = { id: tagResult.tag.id, label: tagResult.tag.label, color: tagResult.tag.color, parentId: null, description: null, sortOrder: tagResult.tag.sortOrder, isTheme: tagResult.tag.isTheme }
              const updated = sortTags([...liveTagsRef.current.filter((t) => t.id !== newTag.id && t.label !== newTag.label), newTag])
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

          setBatchProgress((p) => ({ ...p, done: p.done + 1 }))
        }
      }))
    }

    setBatchRunning(false)
    setBatchSummary({ total: toProcess.length, tagsApplied, firstError })
    router.refresh()
  }

  return (
    <AnalysisWorkspace
      studyId={studyId}
      questionId={questionId}
      tagDefinitions={tagDefinitions}
      tagIdsByAnswer={tagIdsByAnswer}
      answers={answers}
      tagById={tagById}
      savingAnswerId={savingAnswerId}
      savingTagId={savingTagId}
      batchRunning={batchRunning}
      batchProgress={batchProgress}
      batchSummary={batchSummary}
      batchMode={batchMode}
      setBatchMode={setBatchMode}
      onRunBatch={(answerIds, modeOverride) => void runBatchTag(answerIds, modeOverride)}
      onClearBatchSummary={() => setBatchSummary(null)}
      onApply={applyTag}
      onCreateAndApply={createAndApplyTag}
      onRemove={removeTag}
      onRename={renameTag}
      onDelete={deleteTag}
      onCreate={createTag}
      onMoveToTheme={moveTagToTheme}
      onReorderTags={reorderTags}
      onUpdateDescription={updateDescription}
    />
  )
}
