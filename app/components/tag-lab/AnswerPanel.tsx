'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/app/components/ui'
import AppliedTagChip from './AppliedTagChip'
import AnswerFilterMultiSelect from './AnswerFilterMultiSelect'
import TagAutocomplete from './TagAutocomplete'
import type { Answer, AnswerSortBy, FilterOption, TagDefinition } from './types'
import { UNTAGGED_FILTER, formatDate, isThemeTag, sortTags } from './utils'

export default function AnswerPanel({
  answers,
  tagDefinitions,
  tagIdsByAnswer,
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
}: {
  answers: Answer[]
  tagDefinitions: TagDefinition[]
  tagIdsByAnswer: Record<string, string[]>
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
}) {
  const [visibleCount, setVisibleCount] = useState(15)
  const [answerSearch, setAnswerSearch] = useState('')
  const [answerSort, setAnswerSort] = useState<AnswerSortBy>('newest')
  const [filterTagIds, setFilterTagIds] = useState<string[]>([])
  const [filterParticipants, setFilterParticipants] = useState<string[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<Set<string>>(new Set())

  const themes = useMemo(() => sortTags(tagDefinitions.filter((tag) => isThemeTag(tag))), [tagDefinitions])
  const ungroupedTags = useMemo(() => sortTags(tagDefinitions.filter((tag) => tag.parentId === null && !isThemeTag(tag))), [tagDefinitions])
  const leafTagsForApply = useMemo(() => tagDefinitions.filter((tag) => !isThemeTag(tag)), [tagDefinitions])
  const uniqueParticipants = useMemo(() => [...new Set(answers.map((answer) => answer.participantName))].sort(), [answers])
  const participantFilterOptions = useMemo<FilterOption[]>(
    () => uniqueParticipants.map((name) => ({ value: name, label: name })),
    [uniqueParticipants]
  )
  const answerTagFilterOptions = useMemo<FilterOption[]>(() => [
    { value: UNTAGGED_FILTER, label: 'Without tags' },
    ...themes.flatMap((theme) =>
      tagDefinitions
        .filter((tag) => tag.parentId === theme.id)
        .map((tag) => ({ value: tag.id, label: `${theme.label} › ${tag.label}`, color: tag.color }))
    ),
    ...ungroupedTags.map((tag) => ({ value: tag.id, label: tag.label, color: tag.color })),
  ], [themes, tagDefinitions, ungroupedTags])
  const answerTagFilterSet = useMemo(() => new Set(filterTagIds), [filterTagIds])
  const selectedAnswerTagFilters = useMemo(
    () => answerTagFilterOptions.filter((option) => answerTagFilterSet.has(option.value)),
    [answerTagFilterOptions, answerTagFilterSet]
  )
  const participantSummary = useMemo(() => {
    if (filterParticipants.length === 0) return ''
    if (filterParticipants.length === 1) return filterParticipants[0].split(' ')[0]
    return `${filterParticipants.length} participants`
  }, [filterParticipants])
  const answerListTitle = useMemo(() => {
    if (selectedAnswerTagFilters.length === 0) return 'All answers'
    if (selectedAnswerTagFilters.length === 1) return selectedAnswerTagFilters[0].label
    return `${selectedAnswerTagFilters.length} filters`
  }, [selectedAnswerTagFilters])

  const displayedAnswers = useMemo(() => {
    let base = answers
    if (filterTagIds.length > 0) {
      const selectedFilters = new Set(filterTagIds)
      base = answers.filter((answer) => {
        const answerTagIds = tagIdsByAnswer[answer.answerId] ?? []
        if (selectedFilters.has(UNTAGGED_FILTER) && answerTagIds.length === 0) return true
        return answerTagIds.some((id) => selectedFilters.has(id))
      })
    }
    if (filterParticipants.length > 0) {
      const selectedParticipants = new Set(filterParticipants)
      base = base.filter((answer) => selectedParticipants.has(answer.participantName))
    }
    const search = answerSearch.trim().toLowerCase()
    const filtered = search ? base.filter((answer) => answer.answer.toLowerCase().includes(search) || answer.participantName.toLowerCase().includes(search)) : base
    return [...filtered].sort((a, b) => {
      if (answerSort === 'newest') return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      if (answerSort === 'oldest') return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
      if (answerSort === 'longest') return b.answer.length - a.answer.length
      if (answerSort === 'shortest') return a.answer.length - b.answer.length
      return a.participantName.localeCompare(b.participantName)
    })
  }, [answers, tagIdsByAnswer, filterTagIds, filterParticipants, answerSearch, answerSort])

  const aiTagTargetIds = useMemo(
    () => selectedAnswerIds.size > 0 ? Array.from(selectedAnswerIds) : displayedAnswers.map((answer) => answer.answerId),
    [displayedAnswers, selectedAnswerIds]
  )

  function clearAnswerSelection() {
    setSelectedAnswerIds(new Set())
  }

  function toggleAnswerSelect(answerId: string) {
    setSelectedAnswerIds((prev) => {
      const next = new Set(prev)
      if (next.has(answerId)) next.delete(answerId)
      else next.add(answerId)
      return next
    })
  }

  function toggleParticipantFilter(value: string) {
    setFilterParticipants((prev) => prev.includes(value) ? prev.filter((name) => name !== value) : [...prev, value])
    setVisibleCount(15)
    clearAnswerSelection()
  }

  function clearParticipantFilters() {
    setFilterParticipants([])
    setVisibleCount(15)
    clearAnswerSelection()
  }

  function toggleAnswerTagFilter(value: string) {
    setFilterTagIds((prev) => prev.includes(value) ? prev.filter((id) => id !== value) : [...prev, value])
    setVisibleCount(15)
    clearAnswerSelection()
  }

  function clearAnswerTagFilters() {
    setFilterTagIds([])
    setVisibleCount(15)
    clearAnswerSelection()
  }

  function handleAiTagClick() {
    if (batchSummary) onClearBatchSummary()
    const mode = leafTagsForApply.length === 0 ? 'explore' : 'apply'
    setBatchMode(mode)
    onRunBatch(aiTagTargetIds, mode)
  }

  async function handleBulkApplyTag(tagId: string) {
    for (const answerId of Array.from(selectedAnswerIds)) await onApply(answerId, tagId)
  }

  async function handleBulkCreateAndApply(label: string) {
    for (const answerId of Array.from(selectedAnswerIds)) await onCreateAndApply(answerId, label)
  }

  if (answers.length === 0) return null

  return (
    <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
      <div className="border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <input
            type="checkbox"
            checked={displayedAnswers.length > 0 && displayedAnswers.every((answer) => selectedAnswerIds.has(answer.answerId))}
            ref={(el) => { if (el) el.indeterminate = displayedAnswers.some((answer) => selectedAnswerIds.has(answer.answerId)) && !displayedAnswers.every((answer) => selectedAnswerIds.has(answer.answerId)) }}
            onChange={() => {
              const allSelected = displayedAnswers.every((answer) => selectedAnswerIds.has(answer.answerId))
              setSelectedAnswerIds(allSelected ? new Set() : new Set(displayedAnswers.map((answer) => answer.answerId)))
            }}
            aria-label="Select all visible answers"
            className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
          />
          <span className="text-sm font-semibold text-[var(--text)] shrink-0">
            {answerListTitle}
            {participantSummary && <span className="font-normal text-[var(--text-tertiary)]"> · {participantSummary}</span>}
          </span>
          <div className="flex-1" />
          {batchRunning
            ? <span className="text-sm text-[var(--text-tertiary)] whitespace-nowrap shrink-0">Tagging…</span>
            : batchSummary
              ? <Button tone="secondary" size="sm" onClick={handleAiTagClick} className="shrink-0 whitespace-nowrap">✦ Tag again</Button>
              : <Button tone="secondary" size="sm" onClick={handleAiTagClick} disabled={aiTagTargetIds.length === 0} className="shrink-0 whitespace-nowrap">{selectedAnswerIds.size > 0 ? '✦ AI tag selected' : '✦ AI tag all'}</Button>
          }
          <button
            type="button"
            title="Filter answers"
            onClick={() => { setFilterOpen((v) => !v); setSortOpen(false) }}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${filterOpen || filterTagIds.length > 0 || filterParticipants.length > 0 || answerSearch ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]'}`}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M1.5 4h13M4.5 8h7M7 12h2" />
            </svg>
          </button>
          <button
            type="button"
            title="Sort answers"
            onClick={() => { setSortOpen((v) => !v); setFilterOpen(false) }}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${sortOpen || answerSort !== 'newest' ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]'}`}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 4h8M2 8h5M2 12h3" />
              <path d="M12 3v10M10 10.5l2 2 2-2" />
            </svg>
          </button>
        </div>
        {filterOpen && (
          <div className="grid gap-3 border-t border-[var(--border-subtle)] px-4 pb-3 pt-3 md:grid-cols-[minmax(180px,240px)_minmax(220px,1fr)]">
            <div className="space-y-1">
              <span className="block text-xs font-medium text-[var(--text-tertiary)]">Participant</span>
              <AnswerFilterMultiSelect
                values={filterParticipants}
                options={participantFilterOptions}
                placeholder="All participants"
                onToggle={toggleParticipantFilter}
                onClear={clearParticipantFilters}
                buttonClassName="h-8 rounded-lg bg-white text-sm"
              />
            </div>
            <div className="space-y-1">
              <span className="block text-xs font-medium text-[var(--text-tertiary)]">Tagged with</span>
              <AnswerFilterMultiSelect
                values={filterTagIds}
                options={answerTagFilterOptions}
                placeholder="All answers"
                onToggle={toggleAnswerTagFilter}
                onClear={clearAnswerTagFilters}
                buttonClassName="h-8 rounded-lg bg-white text-sm"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <span className="block text-xs font-medium text-[var(--text-tertiary)]">Search</span>
              <input
                type="search"
                value={answerSearch}
                onChange={(e) => { setAnswerSearch(e.target.value); setVisibleCount(15); clearAnswerSelection() }}
                placeholder="Text or participant name…"
                className="h-8 w-full rounded-lg border border-[var(--border)] bg-white px-2.5 py-0 text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--accent-ring)]"
              />
            </div>
          </div>
        )}
        {sortOpen && (
          <div className="flex items-center gap-1.5 flex-wrap px-4 pb-3 border-t border-[var(--border-subtle)] pt-3">
            {([['newest', 'Newest first'], ['oldest', 'Oldest first'], ['name-az', 'Name A→Z'], ['longest', 'Longest first'], ['shortest', 'Shortest first']] as [AnswerSortBy, string][]).map(([val, label]) => (
              <button key={val} type="button"
                onClick={() => { setAnswerSort(val); setVisibleCount(15) }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${answerSort === val ? 'border-[var(--accent-muted)] bg-[var(--accent-subtle)] text-[var(--text-link)]' : 'border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--border-strong)]'}`}
              >{label}</button>
            ))}
          </div>
        )}
      </div>
      {batchRunning && (
        <div className="px-4 py-4 space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${batchProgress.total ? (batchProgress.done / batchProgress.total) * 100 : 0}%` }} />
          </div>
          <p className="text-sm text-[var(--text-tertiary)]">{batchProgress.done} / {batchProgress.total} answers processed…</p>
        </div>
      )}
      {batchSummary && !batchRunning && (
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          {batchSummary.firstError && <p className="mb-2 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', border: '1px solid var(--danger-border)' }}>Error: {batchSummary.firstError}</p>}
          {batchSummary.tagsApplied > 0
            ? <p className="text-sm font-semibold" style={{ color: 'var(--success-text)' }}>Done — {batchSummary.tagsApplied} tag assignment{batchSummary.tagsApplied !== 1 ? 's' : ''} across {batchSummary.total} answer{batchSummary.total !== 1 ? 's' : ''}</p>
            : <p className="text-sm text-[var(--text-secondary)]">Processed {batchSummary.total} answers but found nothing new to tag.{batchMode === 'apply' && tagDefinitions.length === 0 && ' No existing tags — try Explore mode.'}</p>
          }
        </div>
      )}
      {selectedAnswerIds.size > 0 && !batchRunning && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 bg-[var(--accent-subtle)] border-b border-[var(--accent-muted)]">
          <span className="text-sm font-semibold text-[var(--text)] shrink-0">{selectedAnswerIds.size} selected</span>
          <span className="text-[var(--text-tertiary)] shrink-0">·</span>
          <span className="text-xs text-[var(--text-tertiary)] shrink-0">Apply tag to all:</span>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {leafTagsForApply.map((tag) => (
              <button key={tag.id} type="button" onClick={() => void handleBulkApplyTag(tag.id)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white px-2.5 py-0.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-muted)] hover:bg-white hover:text-[var(--text-link)]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />{tag.label}
              </button>
            ))}
          </div>
          {leafTagsForApply.length === 0 && <span className="text-xs text-[var(--text-tertiary)]">No tags yet — create one above</span>}
          <TagAutocomplete tags={tagDefinitions} appliedTagIds={[]} onApply={(id) => void handleBulkApplyTag(id)} onCreate={(label) => void handleBulkCreateAndApply(label)} disabled={savingTagId === 'new'} />
          <div className="flex-1" />
          <button type="button" onClick={clearAnswerSelection} aria-label="Clear selection" className="rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text)]">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
      )}
      {!batchRunning && (
        <div className="divide-y divide-[var(--border-subtle)]">
          {displayedAnswers.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
              {answerSearch ? 'No answers match your search.' : filterTagIds.includes(UNTAGGED_FILTER) && filterTagIds.length === 1 ? 'Every answer has a tag.' : filterTagIds.length > 0 ? 'No answers match these tags.' : 'No answers yet.'}
            </p>
          )}
          {displayedAnswers.slice(0, visibleCount).map((answer) => {
            const currentTagIds = tagIdsByAnswer[answer.answerId] ?? []
            const currentTags = currentTagIds.map((id) => tagById.get(id)).filter(Boolean) as TagDefinition[]
            const isSaving = savingAnswerId === answer.answerId
            const isSelected = selectedAnswerIds.has(answer.answerId)
            return (
              <article key={answer.answerId} className={`flex gap-3 px-4 py-4 transition-colors ${isSelected ? 'bg-[var(--accent-subtle)]' : ''}`}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleAnswerSelect(answer.answerId)}
                  aria-label={`Select answer from ${answer.participantName}`}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                />
                <div className="flex-1 min-w-0 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-tertiary)]">
                    <span className="font-semibold text-[var(--text-secondary)]">{answer.participantName}</span>
                    <span>{formatDate(answer.submittedAt)}</span>
                    {isSaving && <span>Saving…</span>}
                  </div>
                  <p className="whitespace-pre-wrap rounded-lg bg-[var(--bg-sunken)] px-3 py-2.5 text-sm leading-relaxed text-[var(--text)]">{answer.answer}</p>
                  <div className="space-y-2">
                    {currentTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {currentTags.map((tag) => <AppliedTagChip key={tag.id} tag={tag} parentTag={tag.parentId ? tagById.get(tag.parentId) : undefined} size="sm" onRemove={() => onRemove(answer.answerId, tag.id)} />)}
                      </div>
                    )}
                    {!isSelected && <TagAutocomplete tags={tagDefinitions} appliedTagIds={currentTagIds} onApply={(id) => onApply(answer.answerId, id)} onCreate={(label) => onCreateAndApply(answer.answerId, label)} disabled={isSaving || savingTagId === 'new'} />}
                  </div>
                </div>
              </article>
            )
          })}
          {(visibleCount < displayedAnswers.length || visibleCount > 15) && (
            <div className="flex items-center justify-center gap-3 px-4 py-3">
              {visibleCount < displayedAnswers.length && (
                <Button tone="secondary" size="sm" onClick={() => setVisibleCount((n) => Math.min(n + 15, displayedAnswers.length))}>
                  Load {Math.min(15, displayedAnswers.length - visibleCount)} more
                  <span className="ml-1 font-normal text-[var(--text-tertiary)]">({displayedAnswers.length - visibleCount} remaining)</span>
                </Button>
              )}
              {visibleCount > 15 && <Button tone="ghost" size="sm" onClick={() => setVisibleCount(15)}>Collapse</Button>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
