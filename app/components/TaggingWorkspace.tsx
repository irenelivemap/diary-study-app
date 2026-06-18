'use client'

import { useMemo, useState } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import {
  consolidateTagsWithAI,
  createQuestionTag,
  suggestThemeName,
} from '@/app/actions/analysis'
import { Button } from '@/app/components/ui'
import AIProposalPanel from '@/app/components/tag-lab/AIProposalPanel'
import AnswerPanel from '@/app/components/tag-lab/AnswerPanel'
import { ManageCtx, TagDragOverlay, TagRow, UngroupedDropZone } from '@/app/components/tag-lab/ManageTagRows'
import type { ManageCtxType } from '@/app/components/tag-lab/ManageTagRows'
import { AiErrorMessage, SaveNoticeMessage, SelectedTagsGroupingBar } from '@/app/components/tag-lab/OrganizationFeedback'
import TagAnswers from '@/app/components/tag-lab/TagAnswers'
import type { Answer, ProposedTheme, TagDefinition } from '@/app/components/tag-lab/types'
import TagCreateRow from '@/app/components/tag-lab/TagCreateRow'
import { BulkDeleteConfirm, TagSectionHeader } from '@/app/components/tag-lab/TagSectionControls'
import ThemeCard from '@/app/components/tag-lab/ThemeCard'
import { useTagDragReorder } from '@/app/components/tag-lab/useTagDragReorder'
import { useTagLabData } from '@/app/components/tag-lab/useTagLabData'
import { DEFAULT_COLORS, isThemeTag, normalizeLabel, sortTags } from '@/app/components/tag-lab/utils'

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

  const tagDrag = useTagDragReorder({
    tagDefinitions,
    selectedTagIds,
    onReorderTags,
    onExpandTheme: (themeId) => setExpandedThemeIds((prev) => new Set(prev).add(themeId)),
  })

  const ctxValue: ManageCtxType = {
    selectedTagIds, toggleSelect,
    savingTagId, tagCounts, tagDefinitions,
    renamingId, renameValue, setRenameValue, setRenamingId, commitRename,
    editingDescId, descValue, setDescValue, setEditingDescId, commitDesc,
    onRename,
    startRename, startEditDesc,
    expandedTagIds, toggleTagExpand,
    insertionIndicator: tagDrag.insertionIndicator,
    activeDragIds: tagDrag.activeDragIds,
    landedTagIds: tagDrag.landedTagIds,
    onKeyboardReorder: tagDrag.handleKeyboardReorder,
  }

  return (
    <ManageCtx.Provider value={ctxValue}>
    <DndContext
      id="tag-lab-dnd"
      sensors={tagDrag.sensors}
      autoScroll
      collisionDetection={tagDrag.collisionDetection}
      onDragStart={tagDrag.handleDragStart}
      onDragOver={tagDrag.handleDragOver}
      onDragCancel={tagDrag.handleDragCancel}
      onDragEnd={tagDrag.handleDragEnd}
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
      <SaveNoticeMessage notice={tagDrag.saveNotice} />

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
                dropActive={tagDrag.themeDropTargetId === theme.id}
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
      {tagDrag.activeTagId && (
        <TagDragOverlay
          tag={tagDefinitions.find((tag) => tag.id === tagDrag.activeTagId)}
          dragCount={tagDrag.activeDragIds.length}
        />
      )}
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
  const tagLabData = useTagLabData({ studyId, questionId, initialTags, answers })

  return (
    <AnalysisWorkspace
      studyId={studyId}
      questionId={questionId}
      tagDefinitions={tagLabData.tagDefinitions}
      tagIdsByAnswer={tagLabData.tagIdsByAnswer}
      answers={answers}
      tagById={tagLabData.tagById}
      savingAnswerId={tagLabData.savingAnswerId}
      savingTagId={tagLabData.savingTagId}
      batchRunning={tagLabData.batchRunning}
      batchProgress={tagLabData.batchProgress}
      batchSummary={tagLabData.batchSummary}
      batchMode={tagLabData.batchMode}
      setBatchMode={tagLabData.setBatchMode}
      onRunBatch={(answerIds, modeOverride) => void tagLabData.runBatchTag(answerIds, modeOverride)}
      onClearBatchSummary={tagLabData.clearBatchSummary}
      onApply={tagLabData.applyTag}
      onCreateAndApply={tagLabData.createAndApplyTag}
      onRemove={tagLabData.removeTag}
      onRename={tagLabData.renameTag}
      onDelete={tagLabData.deleteTag}
      onCreate={tagLabData.createTag}
      onMoveToTheme={tagLabData.moveTagToTheme}
      onReorderTags={tagLabData.reorderTags}
      onUpdateDescription={tagLabData.updateDescription}
    />
  )
}
