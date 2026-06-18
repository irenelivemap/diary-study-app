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
import { Button, IconButton, TextInput, TrashIcon } from '@/app/components/ui'
import AIProposalPanel from '@/app/components/tag-lab/AIProposalPanel'
import AnswerPanel from '@/app/components/tag-lab/AnswerPanel'
import { ManageCtx, TagDragOverlay, TagRow, ThemeChildren, ThemeDropZone, UngroupedDropZone } from '@/app/components/tag-lab/ManageTagRows'
import type { ManageCtxType } from '@/app/components/tag-lab/ManageTagRows'
import TagAnswers from '@/app/components/tag-lab/TagAnswers'
import type { Answer, InsertionIndicator, ProposedTheme, SaveNotice, TagDefinition } from '@/app/components/tag-lab/types'
import { DEFAULT_COLORS, isThemeTag, normalizeLabel, sortTags, tagGroup } from '@/app/components/tag-lab/utils'

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 2l4 4-4 4" />
    </svg>
  )
}

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

      <div className="space-y-2">
        {selectedTagIds.size > 0 && bulkAction === 'grouping' && (
          <div className="flex items-center justify-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2">
            <TextInput value={groupName} onChange={(e) => setGroupName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleGroupSelected() } }} placeholder="Theme name…" className="h-8 py-0 w-44 bg-white" />
            <Button tone="secondary" size="sm" onClick={() => void handleSuggestGroupName()} disabled={namingSuggesting}>{namingSuggesting ? '…' : '✦ AI name'}</Button>
            <Button tone="primary" size="sm" onClick={() => void handleGroupSelected()} disabled={!groupName.trim()}>Create theme</Button>
            <Button tone="secondary" size="sm" onClick={() => setBulkAction('idle')}>Cancel</Button>
          </div>
        )}
      </div>

      {/* AI error */}
      {aiError && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', border: '1px solid var(--danger-border)' }}>AI error: {aiError}</p>}
      {saveNotice && (
        <p
          role="status"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            background: saveNotice.tone === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
            color: saveNotice.tone === 'error' ? 'var(--danger-text)' : 'var(--success-text)',
            borderColor: saveNotice.tone === 'error' ? 'var(--danger-border)' : 'var(--success-border)',
          }}
        >
          {saveNotice.message}
        </p>
      )}

      {/* Themes */}
      <div className="space-y-2">
        <div className={`flex items-center gap-2 py-1 pr-1 ${themes.length > 0 ? 'pl-[52px]' : 'pl-1'}`}>
          {themes.length > 0 ? (
            <>
              <input
                type="checkbox"
                checked={allThemesSelected}
                ref={(el) => { if (el) el.indeterminate = someThemesSelected && !allThemesSelected }}
                onChange={toggleSelectAllThemes}
                aria-label="Select all themes"
                className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
              />
              <span className="text-sm font-semibold text-[var(--text)]">All themes</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-[var(--text)]">Themes</span>
          )}
          {themes.length > 0 && (
            <div className="h-8 w-8 shrink-0">
              {selectedThemeIds.size > 0 && themeBulkAction === 'idle' && (
                <IconButton
                  type="button"
                  onClick={() => setThemeBulkAction('confirm-delete')}
                  label="Delete selected themes"
                  tone="trash"
                  className="h-8 w-8 rounded-lg"
                >
                  <TrashIcon />
                </IconButton>
              )}
            </div>
          )}
          <div className="flex-1" />
        </div>
        {selectedThemeIds.size > 0 && themeBulkAction === 'confirm-delete' && (
          <div className="flex items-center justify-end gap-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2">
            <span className="text-sm text-[var(--danger-text)]">Delete {selectedThemeIds.size} selected theme{selectedThemeIds.size !== 1 ? 's' : ''}? Tags will stay ungrouped.</span>
            <Button tone="danger" size="sm" onClick={() => void handleBulkDeleteThemes()}>Confirm</Button>
            <Button tone="secondary" size="sm" onClick={() => setThemeBulkAction('idle')}>Cancel</Button>
          </div>
        )}
        {themes.length === 0 && !aiProposal ? (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-white px-5 py-9 text-center shadow-[var(--shadow-sm)]">
            <p className="text-sm font-semibold text-[var(--text-secondary)]">No themes yet.</p>
          </div>
        ) : themes.length > 0 ? (
          <div className="space-y-2">
            {themes.map((theme) => {
            const children = sortTags(tagDefinitions.filter((t) => t.parentId === theme.id))
            const isOpen = expandedThemeIds.has(theme.id)
            const themeSelected = selectedThemeIds.has(theme.id)
            return (
              <ThemeDropZone key={theme.id} themeId={theme.id} themeLabel={theme.label} active={themeDropTargetId === theme.id}>
                <div
                  className={`group/theme flex items-start gap-3 border-l-4 bg-white px-4 py-3.5 cursor-pointer select-none transition-colors hover:bg-[var(--bg-sunken)]/45 ${isOpen ? 'rounded-t-xl border-b border-[var(--border-subtle)]' : 'rounded-xl'}`}
                  style={{ borderLeftColor: theme.color }}
                  onClick={() => toggleThemeExpand(theme.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleThemeExpand(theme.id) } }}
                  aria-expanded={isOpen}
                >
                  <span className="shrink-0 mt-1 flex h-5 w-5 items-center justify-center text-[var(--text-tertiary)]">
                    <ChevronIcon open={isOpen} />
                  </span>
                  <input
                    type="checkbox"
                    checked={themeSelected}
                    onChange={() => toggleThemeSelect(theme.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${theme.label}`}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                  />
                  <label className="relative mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer" title="Change theme color" onClick={(e) => e.stopPropagation()}>
                    <span className="block h-[18px] w-[18px] rounded-md ring-1 ring-black/10" style={{ backgroundColor: theme.color }} />
                    <input type="color" value={theme.color} onChange={(e) => onRename(theme.id, theme.label, e.target.value)} aria-label={`${theme.label} color`} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  </label>
                  <div className="flex-1 min-w-0 space-y-1" onClick={(e) => e.stopPropagation()}>
                    {renamingId === theme.id ? (
                      <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => void commitRename(theme)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commitRename(theme) } if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') } }} className="w-full rounded-lg border border-[var(--border-focus)] bg-white px-2 py-0.5 text-sm font-bold text-[var(--text)] outline-none ring-2 ring-[var(--accent-ring)]" />
                    ) : (
                      <button type="button" onClick={() => startRename(theme)} className="group/name flex w-fit max-w-full items-center gap-1 text-left text-[15px] font-bold leading-snug text-[var(--text)] hover:text-[var(--text-link)]">
                        {theme.label}
                        <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 opacity-0 group-hover/name:opacity-50 transition-opacity" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" /></svg>
                      </button>
                    )}
                    {isOpen && (
                      editingDescId === theme.id ? (
                        <textarea
                          autoFocus
                          value={descValue}
                          onChange={(e) => setDescValue(e.target.value)}
                          onBlur={() => void commitDesc(theme.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void commitDesc(theme.id) }
                            if (e.key === 'Escape') setEditingDescId(null)
                          }}
                          rows={2}
                          placeholder="Add description…"
                          className="w-full rounded-lg border border-[var(--border-focus)] bg-white px-2 py-1.5 text-sm text-[var(--text-secondary)] outline-none ring-2 ring-[var(--accent-ring)]"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditDesc(theme)}
                          className="group/desc flex max-w-full items-start gap-1 text-left text-sm italic leading-relaxed text-[var(--text-secondary)] hover:text-[var(--text)]"
                        >
                          <span>{theme.description ?? <span className="not-italic opacity-50">Add description…</span>}</span>
                          <svg viewBox="0 0 12 12" className="mt-1 h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover/desc:opacity-50" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" /></svg>
                        </button>
                      )
                    )}
                  </div>
                  <span className="shrink-0 mt-1 text-xs text-[var(--text-tertiary)] whitespace-nowrap">{children.length} tag{children.length !== 1 ? 's' : ''}</span>
                </div>
                {isOpen && (
                  <ThemeChildren>
                    {children.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-white px-4 py-3 text-sm text-[var(--text-tertiary)]">
                        Drag tags here.
                      </p>
                    ) : (
                      children.map((tag) => (
                        <div key={tag.id}>
                          <TagRow tag={tag} isIndented />
                          {expandedTagIds.has(tag.id) && <TagAnswers tag={tag} indent answers={answers} tagIdsByAnswer={tagIdsByAnswer} onRemove={onRemove} />}
                        </div>
                      ))
                    )}
                  </ThemeChildren>
                )}
              </ThemeDropZone>
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

      {/* Add theme */}
      <div className="space-y-2">
        <div className="flex gap-2 items-center">
          <TextInput
            value={newThemeLabel}
            onChange={(e) => setNewThemeLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreateTheme() } }}
            placeholder="New theme name"
            className="h-9 flex-1 py-0"
          />
          <label className="relative h-5 w-5 shrink-0 cursor-pointer" title="Choose theme color">
            <span className="block h-5 w-5 rounded-full ring-2 ring-[var(--border-strong)]" style={{ backgroundColor: newThemeColor }} />
            <input type="color" value={newThemeColor} onChange={(e) => setNewThemeColor(e.target.value)} aria-label="Theme color" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
          <Button tone="primary" size="sm" onClick={() => void handleCreateTheme()} disabled={!newThemeLabel.trim() || savingTagId === 'new'} className="shrink-0 whitespace-nowrap">Add theme</Button>
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <div className={`flex items-center gap-2 py-1 pr-1 ${topicTags.length > 0 ? 'pl-4' : 'pl-1'}`}>
          {topicTags.length > 0 ? (
            <>
              <input
                type="checkbox"
                checked={allTopicsSelected}
                ref={(el) => { if (el) el.indeterminate = someTopicsSelected && !allTopicsSelected }}
                onChange={toggleSelectAllTopics}
                aria-label="Select all tags"
                className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
              />
              <span className="text-sm font-semibold text-[var(--text)]">All tags</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-[var(--text)]">Tags</span>
          )}
          {topicTags.length > 0 && (
            <div className="h-8 w-8 shrink-0">
              {selectedTagIds.size > 0 && bulkAction === 'idle' && (
                <IconButton
                  type="button"
                  onClick={() => setBulkAction('confirm-delete')}
                  label="Delete selected tags"
                  tone="trash"
                  className="h-8 w-8 rounded-lg"
                >
                  <TrashIcon />
                </IconButton>
              )}
            </div>
          )}
          <div className="flex-1" />
          {(topicTags.length > 0 || consolidating) && (
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
        </div>
        {selectedTagIds.size > 0 && bulkAction === 'confirm-delete' && (
          <div className="flex items-center justify-end gap-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2">
            <span className="text-sm text-[var(--danger-text)]">Delete {selectedTagIds.size} selected tag{selectedTagIds.size !== 1 ? 's' : ''}?</span>
            <Button tone="danger" size="sm" onClick={() => void handleBulkDelete()}>Confirm</Button>
            <Button tone="secondary" size="sm" onClick={() => setBulkAction('idle')}>Cancel</Button>
          </div>
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

      {/* Add tag */}
      <div className="space-y-2">
        <div className="flex gap-2 items-center">
          <TextInput value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreate() } }} placeholder="New tag name" className="h-9 py-0 flex-1 min-w-40" />
          <label className="relative h-5 w-5 shrink-0 cursor-pointer" title="Choose color">
            <span className="block h-5 w-5 rounded-full ring-2 ring-[var(--border-strong)]" style={{ backgroundColor: newColor }} />
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} aria-label="Tag color" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
          </label>
          <Button tone="primary" size="sm" onClick={() => void handleCreate()} disabled={!newLabel.trim() || savingTagId === 'new'} className="shrink-0 whitespace-nowrap">{savingTagId === 'new' ? 'Adding…' : 'Add tag'}</Button>
        </div>
      </div>

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
