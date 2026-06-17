'use client'

import { createContext, useContext, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  consolidateTagsWithAI,
  createQuestionTag,
  deleteQuestionTag,
  mergeQuestionTags,
  setTagParent,
  suggestTagsWithAI,
  suggestThemeName,
  updateAnswerTags,
  updateQuestionTag,
  updateTagDescription,
} from '@/app/actions/analysis'
import { Button, IconButton, TextInput, TrashIcon } from '@/app/components/ui'
import SelectMenu from '@/app/components/SelectMenu'

// ─── Types ───────────────────────────────────────────────────────────────────

type TagDefinition = {
  id: string
  label: string
  color: string
  parentId: string | null
  description: string | null
}

type Answer = {
  entryId: string
  participantName: string
  participantEmail: string
  date: string
  submittedAt: string
  answerId: string
  answer: string
  tags: { id: string; label: string; color: string }[]
}

type FilterType = 'all' | 'untagged' | 'tag' | 'participant'
type SortBy = 'date' | 'size' | 'tag' | 'participant'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_COLORS = ['#4f46e5', '#0d9488', '#d97706', '#7c3aed', '#e11d48', '#0891b2']

function readableTextColor(hex: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '#0f172a'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0f172a' : '#ffffff'
}

function normalizeLabel(label: string) {
  return label.trim().replace(/\s+/g, ' ').slice(0, 40)
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── AppliedTagChip ───────────────────────────────────────────────────────────

function AppliedTagChip({
  tag,
  parentTag,
  onRemove,
  size = 'md',
}: {
  tag: TagDefinition
  parentTag?: TagDefinition
  onRemove: () => void
  size?: 'sm' | 'md'
}) {
  const textColor = readableTextColor(tag.color)
  const sm = size === 'sm'
  return (
    <span className="inline-flex flex-col items-start">
      {parentTag && (
        <span className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]`}>
          {parentTag.label}
        </span>
      )}
      <span
        className={`inline-flex items-center gap-1 rounded-full font-semibold ${sm ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}
        style={{ backgroundColor: tag.color, color: textColor }}
      >
        {tag.label}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${tag.label}`}
          className="rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <svg viewBox="0 0 16 16" className={sm ? 'h-2.5 w-2.5' : 'h-3 w-3'} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </span>
    </span>
  )
}

// ─── TagAutocomplete ──────────────────────────────────────────────────────────

function TagAutocomplete({
  tags,
  appliedTagIds,
  onApply,
  onCreate,
  disabled,
}: {
  tags: TagDefinition[]
  appliedTagIds: string[]
  onApply: (tagId: string) => void
  onCreate: (label: string) => void
  disabled?: boolean
}) {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(-1)

  // Only show leaf tags (sub-tags and standalone) in the autocomplete — not themes
  const leafTags = useMemo(() => tags.filter((t) => {
    const isTheme = t.parentId === null && tags.some((c) => c.parentId === t.id)
    return !isTheme
  }), [tags])

  const suggestions = useMemo(() => {
    if (!value.trim()) return []
    const q = value.toLowerCase()
    return leafTags.filter((t) => !appliedTagIds.includes(t.id) && t.label.toLowerCase().includes(q))
  }, [value, leafTags, appliedTagIds])

  function commit(tag: TagDefinition | null, raw: string) {
    if (tag) {
      onApply(tag.id)
    } else {
      const label = normalizeLabel(raw)
      if (!label) return
      const exact = leafTags.find((t) => t.label.toLowerCase() === label.toLowerCase())
      exact ? onApply(exact.id) : onCreate(label)
    }
    setValue('')
    setOpen(false)
    setCursor(-1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault()
      const picked = cursor >= 0 ? suggestions[cursor] : suggestions[0]
      commit(picked, picked.label)
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((i) => Math.min(i + 1, suggestions.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((i) => Math.max(i - 1, -1)); return }
    if (e.key === 'Escape') { setValue(''); setOpen(false); setCursor(-1); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      const picked = cursor >= 0 ? suggestions[cursor] : (suggestions[0] ?? null)
      commit(picked, value)
    }
  }

  const exactMatch = value.trim() && leafTags.some((t) => t.label.toLowerCase() === value.trim().toLowerCase())

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true); setCursor(-1) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder="Search tags — Tab or Enter to apply, Enter to create new"
        className="h-9 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-sunken)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] transition-all focus:border-[var(--border-focus)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] disabled:opacity-50"
      />
      {open && (suggestions.length > 0 || (value.trim() && !exactMatch)) && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-48 rounded-xl border border-[var(--border)] bg-white shadow-lg overflow-hidden">
          {suggestions.slice(0, 8).map((tag, i) => {
            const parent = tag.parentId ? leafTags.find((t) => t.id === tag.parentId) : null
            return (
              <button
                key={tag.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); commit(tag, tag.label) }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  i === cursor ? 'bg-[var(--accent-subtle)] text-[var(--text-link)]' : 'text-[var(--text)] hover:bg-[var(--bg-sunken)]'
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="flex-1 text-left">
                  {parent && <span className="mr-1 text-[var(--text-tertiary)]">{parent.label} › </span>}
                  {tag.label}
                </span>
              </button>
            )
          })}
          {value.trim() && !exactMatch && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commit(null, value) }}
              className="flex w-full items-center gap-2 border-t border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]"
            >
              <span className="font-semibold text-[var(--accent)]">+</span>
              Create &ldquo;{normalizeLabel(value)}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SegmentedControl ─────────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`whitespace-nowrap px-3 py-1.5 text-sm font-semibold transition-colors ${
            value === opt.value
              ? 'bg-[var(--accent)] text-[var(--text-on-accent)]'
              : 'bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── CodeTab ─────────────────────────────────────────────────────────────────

function CodeTab({
  answers,
  tagDefinitions,
  tagIdsByAnswer,
  tagById,
  savingAnswerId,
  savingTagId,
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
  onApply: (answerId: string, tagId: string) => void
  onCreateAndApply: (answerId: string, label: string) => void
  onRemove: (answerId: string, tagId: string) => void
}) {
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterTagId, setFilterTagId] = useState('')
  const [filterEmail, setFilterEmail] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [cardIndex, setCardIndex] = useState(0)
  const [aiMode, setAiMode] = useState<'apply' | 'explore'>('apply')
  const [suggesting, setSuggesting] = useState(false)
  const [aiResult, setAiResult] = useState<{ apply: string[]; new_tags: string[]; error?: string } | null>(null)
  const lastSuggestedAnswerId = useRef<string | null>(null)

  // Build theme list for "By tag" filter: themes + standalone tags
  const themes = useMemo(() => tagDefinitions.filter((t) => t.parentId === null && tagDefinitions.some((c) => c.parentId === t.id)), [tagDefinitions])
  const standaloneTagsForFilter = useMemo(() => tagDefinitions.filter((t) => t.parentId === null && !tagDefinitions.some((c) => c.parentId === t.id)), [tagDefinitions])

  const tagFilterOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: '', label: 'Pick a tag…' }]
    for (const theme of themes) {
      opts.push({ value: `theme:${theme.id}`, label: `📂 ${theme.label}` })
      for (const child of tagDefinitions.filter((t) => t.parentId === theme.id)) {
        opts.push({ value: child.id, label: `  › ${child.label}` })
      }
    }
    for (const tag of standaloneTagsForFilter) {
      opts.push({ value: tag.id, label: tag.label })
    }
    return opts
  }, [themes, standaloneTagsForFilter, tagDefinitions])

  const participants = useMemo(() => {
    const seen = new Map<string, string>()
    for (const a of answers) {
      if (!seen.has(a.participantEmail)) seen.set(a.participantEmail, a.participantName)
    }
    return Array.from(seen.entries())
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [answers])

  const filtered = useMemo(() => {
    let result = [...answers]
    if (filterType === 'untagged') {
      result = result.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).length === 0)
    } else if (filterType === 'tag' && filterTagId) {
      if (filterTagId.startsWith('theme:')) {
        const themeId = filterTagId.slice(6)
        const subTagIds = new Set(tagDefinitions.filter((t) => t.parentId === themeId).map((t) => t.id))
        result = result.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).some((id) => subTagIds.has(id)))
      } else {
        result = result.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).includes(filterTagId))
      }
    } else if (filterType === 'participant' && filterEmail) {
      result = result.filter((a) => a.participantEmail === filterEmail)
    }
    if (sortBy === 'date') result.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    else if (sortBy === 'size') result.sort((a, b) => b.answer.length - a.answer.length)
    else if (sortBy === 'participant') result.sort((a, b) => a.participantName.localeCompare(b.participantName))
    else if (sortBy === 'tag') {
      result.sort((a, b) => {
        const aTag = (tagIdsByAnswer[a.answerId] ?? []).map((id) => tagById.get(id)?.label ?? '').sort()[0] ?? '￿'
        const bTag = (tagIdsByAnswer[b.answerId] ?? []).map((id) => tagById.get(id)?.label ?? '').sort()[0] ?? '￿'
        return aTag.localeCompare(bTag)
      })
    }
    return result
  }, [answers, filterType, filterTagId, filterEmail, sortBy, tagIdsByAnswer, tagById, tagDefinitions])

  const totalUntagged = useMemo(
    () => answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).length === 0).length,
    [answers, tagIdsByAnswer],
  )

  const safeIndex = Math.min(cardIndex, Math.max(0, filtered.length - 1))
  const current = filtered[safeIndex] ?? null
  const currentTagIds = current ? (tagIdsByAnswer[current.answerId] ?? []) : []
  const currentTags = currentTagIds.map((id) => tagById.get(id)).filter(Boolean) as TagDefinition[]
  // Only leaf tags shown as chips; themes are inferred
  const currentLeafTags = currentTags.filter((t) => t.parentId !== null || !tagDefinitions.some((c) => c.parentId === t.id))

  async function runSuggest() {
    if (!current) return
    setSuggesting(true)
    setAiResult(null)
    lastSuggestedAnswerId.current = current.answerId
    // Only pass leaf tags to AI
    const leafTagsForAI = tagDefinitions.filter((t) => t.parentId !== null || !tagDefinitions.some((c) => c.parentId === t.id))
    try {
      const result = await suggestTagsWithAI(
        current.answer,
        leafTagsForAI.map((t) => ({ id: t.id, label: t.label })),
        aiMode,
      )
      setAiResult(result)
    } catch (e) {
      setAiResult({ apply: [], new_tags: [], error: e instanceof Error ? e.message : 'Unknown error' })
    }
    setSuggesting(false)
  }

  function changeFilter(type: FilterType) {
    setFilterType(type)
    setCardIndex(0)
    setAiResult(null)
  }

  const participantOptions = participants.map((p) => ({ value: p.email, label: p.name }))
  const sortOptions: { value: SortBy; label: string }[] = [
    { value: 'date', label: 'Date' },
    { value: 'size', label: 'Length' },
    { value: 'tag', label: 'Tag' },
    { value: 'participant', label: 'Participant' },
  ]

  // Available leaf tags for quick-apply (not already applied, not in AI suggestions)
  const leafTagsForApply = tagDefinitions.filter((t) => t.parentId !== null || !tagDefinitions.some((c) => c.parentId === t.id))

  return (
    <div className="space-y-4">
      {/* Filter / sort bar */}
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          options={[
            { value: 'all' as FilterType, label: 'All' },
            { value: 'untagged' as FilterType, label: 'Untagged' },
            { value: 'tag' as FilterType, label: 'By tag' },
            { value: 'participant' as FilterType, label: 'By participant' },
          ]}
          value={filterType}
          onChange={changeFilter}
        />

        {filterType === 'tag' && (
          <SelectMenu
            value={filterTagId || (tagFilterOptions[0]?.value ?? '')}
            options={tagFilterOptions}
            onChange={(v) => { setFilterTagId(v); setCardIndex(0) }}
            buttonClassName="h-9 rounded-lg text-sm"
            className="w-52"
          />
        )}
        {filterType === 'participant' && (
          <SelectMenu
            value={filterEmail || (participantOptions[0]?.value ?? '')}
            options={[{ value: '', label: 'Pick a participant…' }, ...participantOptions]}
            onChange={(v) => { setFilterEmail(v); setCardIndex(0) }}
            buttonClassName="h-9 rounded-lg text-sm"
            className="w-52"
          />
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-tertiary)]">Sort</span>
          <SelectMenu
            value={sortBy}
            options={sortOptions}
            onChange={(v) => { setSortBy(v as SortBy); setCardIndex(0) }}
            buttonClassName="h-9 rounded-lg text-sm"
            className="w-36"
          />
        </div>

        {totalUntagged > 0 && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-800">
            {totalUntagged} untagged
          </span>
        )}
      </div>

      {/* Card */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-white px-6 py-16 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">No answers match this filter.</p>
        </div>
      ) : current ? (
        <div className="rounded-xl border border-[var(--border)] bg-white">
          {/* Card header */}
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-3">
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-semibold text-[var(--text)]">{current.participantName}</span>
              <span className="mx-2 text-[var(--text-muted)]">·</span>
              <span className="text-[var(--text-secondary)]">{current.participantEmail}</span>
              <span className="mx-2 text-[var(--text-muted)]">·</span>
              <span className="text-[var(--text-tertiary)]">{formatDate(current.submittedAt)}</span>
              {savingAnswerId === current.answerId && (
                <span className="ml-3 text-xs text-[var(--text-tertiary)]">Saving…</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setCardIndex((i) => Math.max(0, i - 1))}
                disabled={safeIndex === 0}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] disabled:opacity-30"
                aria-label="Previous answer"
              >
                ←
              </button>
              <span className="min-w-16 text-center text-sm text-[var(--text-secondary)] tabular-nums">
                {safeIndex + 1} / {filtered.length}
              </span>
              <button
                type="button"
                onClick={() => setCardIndex((i) => Math.min(filtered.length - 1, i + 1))}
                disabled={safeIndex === filtered.length - 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] disabled:opacity-30"
                aria-label="Next answer"
              >
                →
              </button>
            </div>
          </div>

          {/* Answer text */}
          <div className="px-5 py-4">
            <p className="whitespace-pre-wrap rounded-xl bg-[var(--bg-sunken)] px-4 py-4 text-sm leading-relaxed text-[var(--text)]">
              {current.answer}
            </p>
          </div>

          {/* Tags area */}
          <div className="space-y-3 px-5 pb-5">
            {currentLeafTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {currentLeafTags.map((tag) => {
                  const parent = tag.parentId ? tagById.get(tag.parentId) : undefined
                  return (
                    <AppliedTagChip
                      key={tag.id}
                      tag={tag}
                      parentTag={parent}
                      onRemove={() => onRemove(current.answerId, tag.id)}
                    />
                  )
                })}
              </div>
            )}

            {/* Autocomplete + AI suggest */}
            <div className="flex gap-2">
              <TagAutocomplete
                tags={tagDefinitions}
                appliedTagIds={currentTagIds}
                onApply={(tagId) => onApply(current.answerId, tagId)}
                onCreate={(label) => onCreateAndApply(current.answerId, label)}
                disabled={savingAnswerId === current.answerId || savingTagId === 'new'}
              />
              <SegmentedControl
                options={[
                  { value: 'apply' as const, label: 'Apply' },
                  { value: 'explore' as const, label: 'Explore' },
                ]}
                value={aiMode}
                onChange={(v) => { setAiMode(v); setAiResult(null) }}
              />
              <Button
                tone="secondary"
                size="sm"
                onClick={() => void runSuggest()}
                disabled={suggesting}
              >
                {suggesting ? 'Thinking…' : 'Suggest'}
              </Button>
            </div>

            {/* AI result panel */}
            {aiResult && lastSuggestedAnswerId.current === current.answerId && (
              <div className="rounded-lg border border-[var(--accent-muted)] bg-[var(--accent-subtle)] p-3 space-y-2">
                <p className="text-xs font-semibold text-[var(--accent)]">
                  AI suggestions · {aiMode === 'explore' ? 'Explore mode' : 'Apply mode'}
                </p>

                {aiResult.error ? (
                  <p className="text-xs" style={{ color: 'var(--danger-text)' }}>Error: {aiResult.error}</p>
                ) : aiResult.apply.length === 0 && aiResult.new_tags.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary)]">No relevant tags found for this answer.</p>
                ) : null}

                {aiResult.apply.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {aiResult.apply.map((tagId) => {
                      const tag = tagById.get(tagId)
                      if (!tag) return null
                      const isApplied = currentTagIds.includes(tagId)
                      return isApplied ? (
                        <span
                          key={tagId}
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold opacity-50"
                          style={{ backgroundColor: tag.color, color: readableTextColor(tag.color) }}
                        >
                          {tag.label}
                          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 6l3 3 5-5" /></svg>
                        </span>
                      ) : (
                        <button
                          key={tagId}
                          type="button"
                          onClick={() => onApply(current.answerId, tagId)}
                          className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--accent)] bg-white px-3 py-1 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text-on-accent)]"
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                          + {tag.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                {aiResult.new_tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {aiResult.new_tags.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => onCreateAndApply(current.answerId, label)}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--accent)] bg-white px-3 py-1 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text-on-accent)]"
                      >
                        + {label} <span className="text-[10px] opacity-60">new</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Available tags — quick apply */}
            {(() => {
              const suggestedIds = new Set(aiResult?.apply ?? [])
              const available = leafTagsForApply.filter((t) => !currentTagIds.includes(t.id) && !suggestedIds.has(t.id))
              if (!available.length) return null
              return (
                <div className="flex flex-wrap gap-2">
                  {available.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => onApply(current.answerId, tag.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-muted)] hover:bg-[var(--accent-subtle)] hover:text-[var(--text-link)]"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.label}
                    </button>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── ListView ─────────────────────────────────────────────────────────────────

function ListView({
  answers,
  tagDefinitions,
  tagIdsByAnswer,
  tagById,
  savingAnswerId,
  savingTagId,
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
  onApply: (answerId: string, tagId: string) => void
  onCreateAndApply: (answerId: string, label: string) => void
  onRemove: (answerId: string, tagId: string) => void
}) {
  const [tagFilter, setTagFilter] = useState('all')
  const [visibleCount, setVisibleCount] = useState(15)

  const themes = useMemo(() => tagDefinitions.filter((t) => t.parentId === null && tagDefinitions.some((c) => c.parentId === t.id)), [tagDefinitions])
  const standaloneTags = useMemo(() => tagDefinitions.filter((t) => t.parentId === null && !tagDefinitions.some((c) => c.parentId === t.id)), [tagDefinitions])

  const filterOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: 'all', label: 'All' },
      { value: 'untagged', label: 'Untagged' },
    ]
    for (const theme of themes) {
      opts.push({ value: `theme:${theme.id}`, label: `📂 ${theme.label}` })
      for (const child of tagDefinitions.filter((t) => t.parentId === theme.id)) {
        opts.push({ value: child.id, label: `  › ${child.label}` })
      }
    }
    for (const tag of standaloneTags) {
      opts.push({ value: tag.id, label: tag.label })
    }
    return opts
  }, [themes, standaloneTags, tagDefinitions])

  const filtered = useMemo(() => {
    if (tagFilter === 'all') return answers
    if (tagFilter === 'untagged') return answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).length === 0)
    if (tagFilter.startsWith('theme:')) {
      const themeId = tagFilter.slice(6)
      const subTagIds = new Set(tagDefinitions.filter((t) => t.parentId === themeId).map((t) => t.id))
      return answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).some((id) => subTagIds.has(id)))
    }
    return answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).includes(tagFilter))
  }, [answers, tagFilter, tagIdsByAnswer, tagDefinitions])

  const untaggedCount = useMemo(
    () => answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).length === 0).length,
    [answers, tagIdsByAnswer],
  )

  const leafTagsForApply = tagDefinitions.filter((t) => t.parentId !== null || !tagDefinitions.some((c) => c.parentId === t.id))

  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="space-y-2">
        <div className="overflow-x-auto pb-1">
          <SegmentedControl
            options={filterOptions}
            value={tagFilter}
            onChange={(v) => { setTagFilter(v); setVisibleCount(15) }}
          />
        </div>
        <div className="flex items-center gap-2">
          {untaggedCount > 0 && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-800">
              {untaggedCount} untagged
            </span>
          )}
          <span className="text-sm text-[var(--text-tertiary)]">
            {filtered.length} {filtered.length === 1 ? 'answer' : 'answers'}
          </span>
        </div>
      </div>

      {/* Answer list */}
      <div className="rounded-xl border border-[var(--border)] bg-white">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--text-tertiary)]">No answers match this filter.</p>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {visible.map((answer) => {
              const currentTagIds = tagIdsByAnswer[answer.answerId] ?? []
              const currentTags = currentTagIds.map((id) => tagById.get(id)).filter(Boolean) as TagDefinition[]
              const currentLeafTags = currentTags.filter((t) => t.parentId !== null || !tagDefinitions.some((c) => c.parentId === t.id))
              const available = leafTagsForApply.filter((t) => !currentTagIds.includes(t.id))
              const isSaving = savingAnswerId === answer.answerId

              return (
                <article key={answer.answerId} className="space-y-2.5 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-tertiary)]">
                    <span className="font-semibold text-[var(--text-secondary)]">{answer.participantName}</span>
                    <span>{answer.participantEmail}</span>
                    <span>{formatDate(answer.submittedAt)}</span>
                    {isSaving && <span>Saving…</span>}
                  </div>
                  <p className="whitespace-pre-wrap rounded-lg bg-[var(--bg-sunken)] px-3 py-2.5 text-sm leading-relaxed text-[var(--text)]">
                    {answer.answer}
                  </p>
                  <div className="space-y-2">
                    {currentLeafTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {currentLeafTags.map((tag) => {
                          const parent = tag.parentId ? tagById.get(tag.parentId) : undefined
                          return (
                            <AppliedTagChip
                              key={tag.id}
                              tag={tag}
                              parentTag={parent}
                              size="sm"
                              onRemove={() => onRemove(answer.answerId, tag.id)}
                            />
                          )
                        })}
                      </div>
                    )}
                    {available.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {available.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => onApply(answer.answerId, tag.id)}
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white px-2.5 py-0.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-muted)] hover:bg-[var(--accent-subtle)] hover:text-[var(--text-link)]"
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                            + {tag.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <TagAutocomplete
                        tags={tagDefinitions}
                        appliedTagIds={currentTagIds}
                        onApply={(tagId) => onApply(answer.answerId, tagId)}
                        onCreate={(label) => onCreateAndApply(answer.answerId, label)}
                        disabled={isSaving || savingTagId === 'new'}
                      />
                    </div>
                  </div>
                </article>
              )
            })}
            {(hasMore || visibleCount > 15) && (
              <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-4">
                {hasMore && (
                  <>
                    <Button tone="secondary" size="sm" onClick={() => setVisibleCount((n) => Math.min(n + 15, filtered.length))}>
                      Load 15 more
                    </Button>
                    <Button tone="secondary" size="sm" onClick={() => setVisibleCount(filtered.length)}>
                      Load all
                    </Button>
                  </>
                )}
                {visibleCount > 15 && (
                  <Button tone="ghost" size="sm" onClick={() => setVisibleCount(15)}>
                    Collapse
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── AIProposalPanel ──────────────────────────────────────────────────────────

type ProposedTheme = {
  tempId: string
  name: string
  description: string
  tagIds: string[]
}

function AIProposalPanel({
  proposal,
  tagById,
  allTagIds,
  studyId,
  questionId,
  tagDefinitions,
  answers,
  tagIdsByAnswer,
  onApply,
  onCancel,
}: {
  proposal: ProposedTheme[]
  tagById: Map<string, TagDefinition>
  allTagIds: Set<string>
  studyId: string
  questionId: string
  tagDefinitions: TagDefinition[]
  answers: Answer[]
  tagIdsByAnswer: Record<string, string[]>
  onApply: (themes: ProposedTheme[]) => Promise<void>
  onCancel: () => void
}) {
  const [themes, setThemes] = useState<ProposedTheme[]>(proposal)
  const [applying, setApplying] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [editingDescId, setEditingDescId] = useState<string | null>(null)
  const [suggestingId, setSuggestingId] = useState<string | null>(null)
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())

  const assignedTagIds = useMemo(() => new Set(themes.flatMap((t) => t.tagIds)), [themes])
  const unassignedTagIds = useMemo(() => [...allTagIds].filter((id) => !assignedTagIds.has(id)), [allTagIds, assignedTagIds])

  function removeSubTag(themeId: string, tagId: string) {
    setThemes((prev) => prev.map((t) => t.tempId === themeId ? { ...t, tagIds: t.tagIds.filter((id) => id !== tagId) } : t))
  }

  function removeTheme(themeId: string) {
    setThemes((prev) => prev.filter((t) => t.tempId !== themeId))
  }

  function renameTheme(themeId: string, name: string) {
    setThemes((prev) => prev.map((t) => t.tempId === themeId ? { ...t, name } : t))
  }

  function updateDesc(themeId: string, description: string) {
    setThemes((prev) => prev.map((t) => t.tempId === themeId ? { ...t, description } : t))
  }

  function addTagToTheme(themeId: string, tagId: string) {
    setThemes((prev) => prev.map((t) => t.tempId === themeId ? { ...t, tagIds: [...t.tagIds, tagId] } : t))
  }

  async function handleSuggestName(theme: ProposedTheme) {
    setSuggestingId(theme.tempId)
    const labels = theme.tagIds.map((id) => tagById.get(id)?.label ?? '').filter(Boolean)
    const result = await suggestThemeName(labels)
    setSuggestingId(null)
    if ('name' in result && result.name) {
      setThemes((prev) => prev.map((t) => t.tempId === theme.tempId ? {
        ...t,
        name: result.name,
        description: result.description ?? t.description,
      } : t))
    }
  }

  async function handleApply() {
    setApplying(true)
    await onApply(themes.filter((t) => t.tagIds.length > 0))
    setApplying(false)
  }

  return (
    <div className="rounded-xl border border-[var(--accent-muted)] bg-[var(--accent-subtle)] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--text)]">
          AI proposed {themes.length} themes — review and adjust before applying
        </p>
      </div>

      <div className="space-y-3">
        {themes.map((theme) => (
          <div key={theme.tempId} className="rounded-lg border border-[var(--border)] bg-white p-4 space-y-3">
            {/* Theme name row */}
            <div className="flex items-start gap-2">
              {renamingId === theme.tempId ? (
                <input
                  autoFocus
                  value={theme.name}
                  onChange={(e) => renameTheme(theme.tempId, e.target.value)}
                  onBlur={() => setRenamingId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') setRenamingId(null)
                  }}
                  className="flex-1 rounded-lg border border-[var(--border-focus)] bg-white px-2 py-1 text-sm font-semibold text-[var(--text)] outline-none ring-2 ring-[var(--accent-ring)]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setRenamingId(theme.tempId)}
                  className="flex-1 text-left text-sm font-semibold text-[var(--text)] hover:text-[var(--text-link)]"
                  title="Click to rename"
                >
                  {theme.name || <span className="text-[var(--text-tertiary)] italic">Unnamed theme</span>}
                </button>
              )}
              <Button
                tone="secondary"
                size="sm"
                onClick={() => void handleSuggestName(theme)}
                disabled={suggestingId === theme.tempId || theme.tagIds.length === 0}
                className="shrink-0 text-xs"
              >
                {suggestingId === theme.tempId ? '…' : '✦ Suggest name'}
              </Button>
              <Button
                tone="danger"
                size="sm"
                onClick={() => removeTheme(theme.tempId)}
                className="shrink-0"
              >
                Remove theme
              </Button>
            </div>

            {/* Description */}
            {editingDescId === theme.tempId ? (
              <textarea
                autoFocus
                value={theme.description}
                onChange={(e) => updateDesc(theme.tempId, e.target.value)}
                onBlur={() => setEditingDescId(null)}
                rows={2}
                className="w-full rounded-lg border border-[var(--border-focus)] bg-white px-2 py-1.5 text-sm text-[var(--text)] outline-none ring-2 ring-[var(--accent-ring)]"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingDescId(theme.tempId)}
                className="w-full text-left text-sm text-[var(--text-secondary)] hover:text-[var(--text)] italic"
                title="Click to edit description"
              >
                {theme.description || <span className="text-[var(--text-tertiary)] not-italic">Add description…</span>}
              </button>
            )}

            {/* Sub-tag chips */}
            <div className="flex flex-wrap gap-2">
              {theme.tagIds.map((tagId) => {
                const tag = tagById.get(tagId)
                if (!tag) return null
                return (
                  <span
                    key={tagId}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-sunken)] border border-[var(--border)] px-2.5 py-0.5 text-sm text-[var(--text-secondary)]"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.label}
                    <button
                      type="button"
                      onClick={() => removeSubTag(theme.tempId, tagId)}
                      aria-label={`Remove ${tag.label} from theme`}
                      className="ml-0.5 rounded-full p-0.5 opacity-50 hover:opacity-100"
                    >
                      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </span>
                )
              })}
            </div>

            {/* Comments for this theme */}
            {(() => {
              const themeTagSet = new Set(theme.tagIds)
              const related = answers.filter((a) =>
                (tagIdsByAnswer[a.answerId] ?? []).some((tid) => themeTagSet.has(tid))
              )
              if (related.length === 0) return null
              const isOpen = expandedComments.has(theme.tempId)
              return (
                <div>
                  <button
                    type="button"
                    onClick={() => setExpandedComments((prev) => {
                      const next = new Set(prev)
                      if (next.has(theme.tempId)) next.delete(theme.tempId)
                      else next.add(theme.tempId)
                      return next
                    })}
                    className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  >
                    <svg viewBox="0 0 16 16" className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="currentColor" aria-hidden>
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                    {related.length} comment{related.length !== 1 ? 's' : ''}
                  </button>
                  {isOpen && (
                    <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
                      {related.map((a) => (
                        <div key={a.answerId} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-3 py-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-[var(--text-secondary)]">{a.participantName}</span>
                            <span className="text-xs text-[var(--text-tertiary)]">{new Date(a.submittedAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-sm text-[var(--text)] line-clamp-3">{a.answer}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Add existing unassigned tag */}
            {unassignedTagIds.length > 0 && (
              <SelectMenu
                value=""
                options={[
                  { value: '', label: '+ Add existing tag to this theme' },
                  ...unassignedTagIds.map((id) => ({ value: id, label: tagById.get(id)?.label ?? id })),
                ]}
                onChange={(v) => { if (v) addTagToTheme(theme.tempId, v) }}
                buttonClassName="h-8 text-sm"
                className="w-64"
              />
            )}
          </div>
        ))}
      </div>

      {unassignedTagIds.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Tags not in any theme
          </p>
          <div className="flex flex-wrap gap-2">
            {unassignedTagIds.map((id) => {
              const tag = tagById.get(id)
              if (!tag) return null
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border-strong)] bg-white px-2.5 py-0.5 text-sm text-[var(--text-secondary)]"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.label}
                </span>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          tone="primary"
          size="sm"
          onClick={() => void handleApply()}
          disabled={applying || themes.filter((t) => t.tagIds.length > 0).length === 0}
        >
          {applying ? 'Applying…' : 'Apply grouping'}
        </Button>
        <Button
          tone="secondary"
          size="sm"
          onClick={onCancel}
          disabled={applying}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ─── ManageTab DnD helpers ────────────────────────────────────────────────────

type ManageCtxType = {
  selectedTagIds: Set<string>
  toggleSelect: (id: string) => void
  savingTagId: string | null
  tagCounts: Map<string, number>
  tagDefinitions: TagDefinition[]
  renamingId: string | null
  renameValue: string
  setRenameValue: (v: string) => void
  setRenamingId: (id: string | null) => void
  commitRename: (tag: TagDefinition) => Promise<void>
  editingDescId: string | null
  descValue: string
  setDescValue: (v: string) => void
  setEditingDescId: (id: string | null) => void
  commitDesc: (id: string) => Promise<void>
  confirmDeleteId: string | null
  setConfirmDeleteId: (id: string | null) => void
  onDelete: (id: string, mode?: 'keep-subtags' | 'delete-all') => void
  onRename: (id: string, label: string, color: string) => void
  startRename: (tag: TagDefinition) => void
  startEditDesc: (tag: TagDefinition) => void
}

const ManageCtx = createContext<ManageCtxType | null>(null)
function useManageCtx() {
  const ctx = useContext(ManageCtx)
  if (!ctx) throw new Error('useManageCtx used outside ManageCtx.Provider')
  return ctx
}

function GripIcon() {
  return (
    <svg viewBox="0 0 10 16" className="h-4 w-2.5" fill="currentColor" aria-hidden>
      <circle cx="2" cy="3" r="1.5" /><circle cx="8" cy="3" r="1.5" />
      <circle cx="2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" />
      <circle cx="2" cy="13" r="1.5" /><circle cx="8" cy="13" r="1.5" />
    </svg>
  )
}

function ThemeDropZone({ themeId, children }: { themeId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `theme-${themeId}` })
  return (
    <div ref={setNodeRef} className={`transition-colors rounded-b-lg ${isOver ? 'bg-[var(--accent-subtle)] ring-2 ring-inset ring-[var(--accent-muted)]' : ''}`}>
      {children}
    </div>
  )
}

function UngroupedDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'ungrouped' })
  return (
    <div ref={setNodeRef} className={`transition-colors rounded-b-xl ${isOver ? 'bg-[var(--accent-subtle)] ring-2 ring-inset ring-[var(--accent-muted)]' : ''}`}>
      {children}
    </div>
  )
}

function TagRow({ tag, isIndented }: { tag: TagDefinition; isIndented?: boolean }) {
  const ctx = useManageCtx()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `tag-${tag.id}` })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined

  const isRenaming = ctx.renamingId === tag.id
  const isEditingDesc = ctx.editingDescId === tag.id
  const isConfirmingDelete = ctx.confirmDeleteId === tag.id
  const count = ctx.tagCounts.get(tag.id) ?? 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-4 py-3 ${isDragging ? 'opacity-40' : ''} ${isIndented ? 'pl-10 border-l-2 border-[var(--border-subtle)] ml-4' : ''}`}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] active:cursor-grabbing"
        aria-label={`Drag ${tag.label} to a theme`}
      >
        <GripIcon />
      </button>

      {/* Selection checkbox */}
      <input
        type="checkbox"
        checked={ctx.selectedTagIds.has(tag.id)}
        onChange={() => ctx.toggleSelect(tag.id)}
        aria-label={`Select ${tag.label}`}
        className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
      />

      {/* Color swatch */}
      <input
        type="color"
        value={tag.color}
        onChange={(e) => ctx.onRename(tag.id, tag.label, e.target.value)}
        aria-label={`${tag.label} color`}
        className="h-7 w-8 cursor-pointer rounded border border-[var(--border)] bg-white p-0.5 shrink-0"
      />

      <div className="flex-1 min-w-0 space-y-0.5">
        {isRenaming ? (
          <input
            autoFocus
            value={ctx.renameValue}
            onChange={(e) => ctx.setRenameValue(e.target.value)}
            onBlur={() => void ctx.commitRename(tag)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void ctx.commitRename(tag) }
              if (e.key === 'Escape') { ctx.setRenamingId(null); ctx.setRenameValue('') }
            }}
            className="w-full rounded-lg border border-[var(--border-focus)] bg-white px-2 py-1 text-sm text-[var(--text)] outline-none ring-2 ring-[var(--accent-ring)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => ctx.startRename(tag)}
            title="Click to rename"
            className="block text-left text-sm font-semibold text-[var(--text)] hover:text-[var(--text-link)]"
          >
            {tag.label}
          </button>
        )}
        {isEditingDesc ? (
          <textarea
            autoFocus
            value={ctx.descValue}
            onChange={(e) => ctx.setDescValue(e.target.value)}
            onBlur={() => void ctx.commitDesc(tag.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ctx.commitDesc(tag.id) }
              if (e.key === 'Escape') { ctx.setEditingDescId(null) }
            }}
            rows={2}
            placeholder="Add description…"
            className="w-full rounded-lg border border-[var(--border-focus)] bg-white px-2 py-1 text-sm text-[var(--text-secondary)] outline-none ring-2 ring-[var(--accent-ring)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => ctx.startEditDesc(tag)}
            className="block text-left text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] italic"
            title="Click to edit description"
          >
            {tag.description || <span className="not-italic opacity-50">Add description…</span>}
          </button>
        )}
      </div>

      <span className="shrink-0 text-sm tabular-nums text-[var(--text-tertiary)]">
        {count} {count === 1 ? 'answer' : 'answers'}
      </span>

      {isConfirmingDelete ? (
        <div className="flex shrink-0 items-center gap-2">
          {ctx.tagDefinitions.some((c) => c.parentId === tag.id) ? (
            <>
              <Button tone="secondary" size="sm" onClick={() => { ctx.onDelete(tag.id, 'keep-subtags'); ctx.setConfirmDeleteId(null) }} className="text-xs whitespace-nowrap">Keep sub-tags</Button>
              <Button tone="danger" size="sm" onClick={() => { ctx.onDelete(tag.id, 'delete-all'); ctx.setConfirmDeleteId(null) }} className="text-xs whitespace-nowrap">Delete all</Button>
            </>
          ) : (
            <Button tone="danger" size="sm" onClick={() => { ctx.onDelete(tag.id); ctx.setConfirmDeleteId(null) }}>Delete</Button>
          )}
          <Button tone="secondary" size="sm" onClick={() => ctx.setConfirmDeleteId(null)}>Cancel</Button>
        </div>
      ) : (
        <IconButton
          tone="trash"
          label={`Delete ${tag.label}`}
          onClick={() => count > 0 || ctx.tagDefinitions.some((c) => c.parentId === tag.id) ? ctx.setConfirmDeleteId(tag.id) : ctx.onDelete(tag.id)}
          disabled={ctx.savingTagId === tag.id}
          className="h-8 w-8 shrink-0"
        >
          <TrashIcon />
        </IconButton>
      )}
    </div>
  )
}

// ─── ManageTab ────────────────────────────────────────────────────────────────

function ManageTab({
  studyId,
  questionId,
  tagDefinitions,
  tagIdsByAnswer,
  answers,
  savingTagId,
  onRename,
  onDelete,
  onCreate,
  onMoveToTheme,
  onUpdateDescription,
}: {
  studyId: string
  questionId: string
  tagDefinitions: TagDefinition[]
  tagIdsByAnswer: Record<string, string[]>
  answers: Answer[]
  savingTagId: string | null
  onRename: (tagId: string, label: string, color: string) => void
  onDelete: (tagId: string, mode?: 'keep-subtags' | 'delete-all') => void
  onCreate: (label: string, color: string) => Promise<TagDefinition | null>
  onMoveToTheme: (tagId: string, parentId: string | null) => Promise<void>
  onUpdateDescription: (tagId: string, description: string) => Promise<void>
}) {
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [editingDescId, setEditingDescId] = useState<string | null>(null)
  const [descValue, setDescValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [consolidating, setConsolidating] = useState(false)
  const [aiProposal, setAiProposal] = useState<ProposedTheme[] | null>(null)
  const [aiProposalScope, setAiProposalScope] = useState<Set<string>>(new Set())
  const [aiError, setAiError] = useState<string | null>(null)

  // ── Selection state ──────────────────────────────────────────────────────────
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'idle' | 'confirm-delete' | 'grouping'>('idle')
  const [groupName, setGroupName] = useState('')
  const [namingSuggesting, setNamingSuggesting] = useState(false)

  function toggleSelect(tagId: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  function isGroupSelected(ids: string[]) {
    return ids.length > 0 && ids.every((id) => selectedTagIds.has(id))
  }

  function isGroupIndeterminate(ids: string[]) {
    return ids.some((id) => selectedTagIds.has(id)) && !ids.every((id) => selectedTagIds.has(id))
  }

  function toggleGroupSelect(ids: string[]) {
    if (isGroupSelected(ids)) {
      setSelectedTagIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next })
    } else {
      setSelectedTagIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next })
    }
  }

  function clearSelection() {
    setSelectedTagIds(new Set())
    setBulkAction('idle')
    setGroupName('')
  }

  async function handleBulkDelete() {
    for (const id of Array.from(selectedTagIds)) {
      const isTheme = tagDefinitions.some((c) => c.parentId === id)
      await onDelete(id, isTheme ? 'keep-subtags' : undefined)
    }
    clearSelection()
  }

  async function handleGroupSelected() {
    const label = normalizeLabel(groupName)
    if (!label) return
    const color = DEFAULT_COLORS[tagDefinitions.length % DEFAULT_COLORS.length]
    const result = await createQuestionTag(studyId, questionId, label, color)
    if (!result?.tag) return
    for (const tagId of Array.from(selectedTagIds)) {
      await onMoveToTheme(tagId, result.tag.id)
    }
    clearSelection()
  }

  async function handleSuggestGroupName() {
    const labels = Array.from(selectedTagIds)
      .map((id) => tagDefinitions.find((t) => t.id === id)?.label ?? '')
      .filter(Boolean)
    if (!labels.length) return
    setNamingSuggesting(true)
    const result = await suggestThemeName(labels)
    setNamingSuggesting(false)
    if ('name' in result && result.name) setGroupName(result.name)
  }

  async function handleBulkMoveToTheme(themeId: string) {
    for (const tagId of Array.from(selectedTagIds)) {
      await onMoveToTheme(tagId, themeId)
    }
    clearSelection()
  }

  async function handleBulkAiGroup() {
    const selectedTags = tagDefinitions.filter((t) => selectedTagIds.has(t.id))
    if (selectedTags.length < 2) return
    setConsolidating(true)
    setAiError(null)
    setAiProposal(null)
    const scope = new Set(selectedTags.map((t) => t.id))
    const result = await consolidateTagsWithAI(studyId, questionId, selectedTags.map((t) => ({ id: t.id, label: t.label })))
    setConsolidating(false)
    if ('error' in result && result.error) { setAiError(result.error as string); return }
    if (result.themes.length === 0) { setAiError('AI returned no theme groupings.'); return }
    setAiProposalScope(scope)
    setAiProposal(result.themes.map((theme, i) => ({
      tempId: `temp-${i}-${Date.now()}`,
      name: theme.name,
      description: theme.description,
      tagIds: theme.tagIds,
    })))
    clearSelection()
  }

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ids of Object.values(tagIdsByAnswer)) {
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
  }, [tagIdsByAnswer])

  const themes = useMemo(
    () => tagDefinitions.filter((t) => t.parentId === null && tagDefinitions.some((c) => c.parentId === t.id)),
    [tagDefinitions],
  )

  const ungroupedTags = useMemo(
    () => tagDefinitions.filter((t) => t.parentId === null && !tagDefinitions.some((c) => c.parentId === t.id)),
    [tagDefinitions],
  )

  // ── DnD ────────────────────────────────────────────────────────────────────
  const [activeTagId, setActiveTagId] = useState<string | null>(null)

  function handleDragEnd(event: DragEndEvent) {
    setActiveTagId(null)
    const { active, over } = event
    if (!over) return
    const tagId = String(active.id).replace(/^tag-/, '')
    const dest = String(over.id)
    if (dest === 'ungrouped') {
      void onMoveToTheme(tagId, null)
    } else if (dest.startsWith('theme-')) {
      void onMoveToTheme(tagId, dest.replace(/^theme-/, ''))
    }
  }

  function startRename(tag: TagDefinition) {
    setRenamingId(tag.id)
    setRenameValue(tag.label)
  }

  async function commitRename(tag: TagDefinition) {
    const label = normalizeLabel(renameValue)
    if (label && label !== tag.label) onRename(tag.id, label, tag.color)
    setRenamingId(null)
    setRenameValue('')
  }

  function startEditDesc(tag: TagDefinition) {
    setEditingDescId(tag.id)
    setDescValue(tag.description ?? '')
  }

  async function commitDesc(tagId: string) {
    await onUpdateDescription(tagId, descValue)
    setEditingDescId(null)
    setDescValue('')
  }

  async function handleCreate() {
    const label = normalizeLabel(newLabel)
    if (!label) return
    await onCreate(label, newColor)
    setNewLabel('')
    setNewColor(DEFAULT_COLORS[tagDefinitions.length % DEFAULT_COLORS.length])
  }

  async function handleAiConsolidate() {
    const leafTags = tagDefinitions.filter((t) => t.parentId === null && !tagDefinitions.some((c) => c.parentId === t.id))
    if (leafTags.length < 2) return
    setConsolidating(true)
    setAiError(null)
    setAiProposal(null)
    const scope = new Set(leafTags.map((t) => t.id))
    const result = await consolidateTagsWithAI(studyId, questionId, leafTags.map((t) => ({ id: t.id, label: t.label })))
    setConsolidating(false)
    if ('error' in result && result.error) {
      setAiError(result.error as string)
      return
    }
    if (result.themes.length === 0) {
      setAiError('AI returned no theme groupings.')
      return
    }
    setAiProposalScope(scope)
    setAiProposal(result.themes.map((theme, i) => ({
      tempId: `temp-${i}-${Date.now()}`,
      name: theme.name,
      description: theme.description,
      tagIds: theme.tagIds,
    })))
  }

  async function applyProposal(themes: ProposedTheme[]) {
    for (const theme of themes) {
      if (!theme.tagIds.length) continue
      // Create the theme tag if it doesn't exist
      const result = await createQuestionTag(studyId, questionId, normalizeLabel(theme.name) || 'Theme', DEFAULT_COLORS[themes.indexOf(theme) % DEFAULT_COLORS.length])
      if (!result?.tag) continue
      const themeTagId = result.tag.id
      // Move sub-tags into the theme
      for (const tagId of theme.tagIds) {
        await onMoveToTheme(tagId, themeTagId)
      }
      // Save description
      if (theme.description) {
        await onUpdateDescription(themeTagId, theme.description)
      }
    }
    setAiProposal(null)
  }

  const ctxValue: ManageCtxType = {
    selectedTagIds, toggleSelect,
    savingTagId, tagCounts, tagDefinitions,
    renamingId, renameValue, setRenameValue, setRenamingId, commitRename,
    editingDescId, descValue, setDescValue, setEditingDescId, commitDesc,
    confirmDeleteId, setConfirmDeleteId, onDelete, onRename,
    startRename, startEditDesc,
  }

  return (
    <ManageCtx.Provider value={ctxValue}>
    <DndContext onDragStart={(e) => setActiveTagId(String(e.active.id).replace(/^tag-/, ''))} onDragEnd={handleDragEnd}>
    <div className="space-y-4">
      {/* New tag + AI group header */}
      <div className="flex gap-2 flex-wrap">
        <TextInput
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreate() } }}
          placeholder="New tag name"
          className="h-9 py-0 flex-1 min-w-40"
        />
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          aria-label="Tag color"
          className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-[var(--border-strong)] bg-white p-1"
        />
        <Button
          tone="primary"
          size="sm"
          onClick={() => void handleCreate()}
          disabled={!newLabel.trim() || savingTagId === 'new'}
          className="shrink-0 whitespace-nowrap"
        >
          {savingTagId === 'new' ? 'Adding…' : 'Add tag'}
        </Button>
        <div className="flex-1" />
        <Button
          tone="secondary"
          size="sm"
          onClick={() => void handleAiConsolidate()}
          disabled={consolidating || ungroupedTags.length < 2}
          className="shrink-0 whitespace-nowrap"
        >
          {consolidating ? '✦ Grouping…' : '✦ Group with AI'}
        </Button>
      </div>

      {/* Selection action bar */}
      {selectedTagIds.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap rounded-xl border border-[var(--accent-muted)] bg-[var(--accent-subtle)] px-4 py-2.5">
          <span className="text-sm font-semibold text-[var(--text)]">{selectedTagIds.size} selected</span>
          <span className="text-[var(--text-tertiary)]">·</span>

          {bulkAction === 'idle' && (
            <>
              <Button tone="danger" size="sm" onClick={() => setBulkAction('confirm-delete')}>Delete</Button>
              {themes.length > 0 && (
                <SelectMenu
                  value=""
                  options={[
                    { value: '', label: 'Move to theme…' },
                    ...themes.map((t) => ({ value: t.id, label: t.label })),
                  ]}
                  onChange={(v) => { if (v) void handleBulkMoveToTheme(v) }}
                  buttonClassName="h-8 text-sm"
                />
              )}
              <Button tone="secondary" size="sm" onClick={() => setBulkAction('grouping')}>Group into theme</Button>
              <Button
                tone="secondary"
                size="sm"
                onClick={() => void handleBulkAiGroup()}
                disabled={consolidating || selectedTagIds.size < 2}
              >
                {consolidating ? '✦ Grouping…' : '✦ Group with AI'}
              </Button>
            </>
          )}

          {bulkAction === 'confirm-delete' && (
            <>
              <span className="text-sm text-[var(--danger-text)]">
                Delete {selectedTagIds.size} tag{selectedTagIds.size !== 1 ? 's' : ''}?
                {Array.from(selectedTagIds).some((id) => tagDefinitions.some((c) => c.parentId === id)) && ' Themes will be removed; sub-tags ungrouped.'}
              </span>
              <Button tone="danger" size="sm" onClick={() => void handleBulkDelete()}>Confirm</Button>
              <Button tone="secondary" size="sm" onClick={() => setBulkAction('idle')}>Cancel</Button>
            </>
          )}

          {bulkAction === 'grouping' && (
            <>
              <TextInput
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleGroupSelected() } }}
                placeholder="Theme name…"
                className="h-8 py-0 w-44"
              />
              <Button
                tone="secondary"
                size="sm"
                onClick={() => void handleSuggestGroupName()}
                disabled={namingSuggesting}
              >
                {namingSuggesting ? '…' : '✦ AI name'}
              </Button>
              <Button
                tone="primary"
                size="sm"
                onClick={() => void handleGroupSelected()}
                disabled={!groupName.trim()}
              >
                Create theme
              </Button>
              <Button tone="secondary" size="sm" onClick={() => setBulkAction('idle')}>Cancel</Button>
            </>
          )}

          <div className="flex-1" />
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear selection"
            className="rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text)]"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      )}

      {/* AI error */}
      {aiError && (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', border: '1px solid var(--danger-border)' }}>
          AI error: {aiError}
        </p>
      )}

      {/* AI proposal panel */}
      {aiProposal && (
        <AIProposalPanel
          proposal={aiProposal}
          tagById={new Map(tagDefinitions.map((t) => [t.id, t]))}
          allTagIds={aiProposalScope}
          studyId={studyId}
          questionId={questionId}
          tagDefinitions={tagDefinitions}
          answers={answers}
          tagIdsByAnswer={tagIdsByAnswer}
          onApply={applyProposal}
          onCancel={() => setAiProposal(null)}
        />
      )}

      {/* Tags list */}
      <div className="rounded-xl border border-[var(--border)] bg-white">
        {tagDefinitions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--text-tertiary)]">No tags yet. Create one above.</p>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">

            {/* THEMES section */}
            {themes.length > 0 && (
              <>
                {themes.map((theme) => {
                  const children = tagDefinitions.filter((t) => t.parentId === theme.id)
                  return (
                    <div key={theme.id}>
                      {/* Theme header row */}
                      <div className="px-4 py-3 bg-[var(--bg-sunken)]">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isGroupSelected(children.map((c) => c.id))}
                            ref={(el) => { if (el) el.indeterminate = isGroupIndeterminate(children.map((c) => c.id)) }}
                            onChange={() => toggleGroupSelect(children.map((c) => c.id))}
                            aria-label={`Select all tags in ${theme.label}`}
                            className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                          />
                          <span className="text-base">📂</span>
                          <input
                            type="color"
                            value={theme.color}
                            onChange={(e) => onRename(theme.id, theme.label, e.target.value)}
                            aria-label={`${theme.label} color`}
                            className="h-7 w-8 cursor-pointer rounded border border-[var(--border)] bg-white p-0.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0 space-y-0.5">
                            {renamingId === theme.id ? (
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={() => void commitRename(theme)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); void commitRename(theme) }
                                  if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') }
                                }}
                                className="w-full rounded-lg border border-[var(--border-focus)] bg-white px-2 py-1 text-sm font-bold text-[var(--text)] outline-none ring-2 ring-[var(--accent-ring)]"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => startRename(theme)}
                                className="block text-left text-sm font-bold text-[var(--text)] hover:text-[var(--text-link)]"
                                title="Click to rename theme"
                              >
                                {theme.label}
                              </button>
                            )}
                            {editingDescId === theme.id ? (
                              <textarea
                                autoFocus
                                value={descValue}
                                onChange={(e) => setDescValue(e.target.value)}
                                onBlur={() => void commitDesc(theme.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void commitDesc(theme.id) }
                                  if (e.key === 'Escape') { setEditingDescId(null) }
                                }}
                                rows={2}
                                placeholder="Add description…"
                                className="w-full rounded-lg border border-[var(--border-focus)] bg-white px-2 py-1 text-sm text-[var(--text-secondary)] outline-none ring-2 ring-[var(--accent-ring)]"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditDesc(theme)}
                                className="block text-left text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] italic"
                                title="Click to edit description"
                              >
                                {theme.description || <span className="not-italic opacity-50">Add description…</span>}
                              </button>
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
                            {children.length} sub-tag{children.length !== 1 ? 's' : ''}
                          </span>
                          {confirmDeleteId === theme.id ? (
                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                tone="secondary"
                                size="sm"
                                onClick={() => { void onDelete(theme.id, 'keep-subtags'); setConfirmDeleteId(null) }}
                                className="text-xs whitespace-nowrap"
                              >
                                Remove theme, keep tags
                              </Button>
                              <Button
                                tone="danger"
                                size="sm"
                                onClick={() => { void onDelete(theme.id, 'delete-all'); setConfirmDeleteId(null) }}
                                className="text-xs whitespace-nowrap"
                              >
                                Delete all
                              </Button>
                              <Button tone="secondary" size="sm" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                            </div>
                          ) : (
                            <IconButton
                              tone="trash"
                              label={`Delete theme ${theme.label}`}
                              onClick={() => setConfirmDeleteId(theme.id)}
                              className="h-8 w-8 shrink-0"
                            >
                              <TrashIcon />
                            </IconButton>
                          )}
                        </div>
                      </div>

                      {/* Sub-tags */}
                      <ThemeDropZone themeId={theme.id}>
                        {children.map((child) => <TagRow key={child.id} tag={child} isIndented />)}
                      </ThemeDropZone>
                    </div>
                  )
                })}
              </>
            )}

            {/* UNGROUPED section */}
            {ungroupedTags.length > 0 && (
              <>
                <div className="flex items-center gap-3 px-4 py-2 bg-[var(--bg-sunken)]">
                  <input
                    type="checkbox"
                    checked={isGroupSelected(ungroupedTags.map((t) => t.id))}
                    ref={(el) => { if (el) el.indeterminate = isGroupIndeterminate(ungroupedTags.map((t) => t.id)) }}
                    onChange={() => toggleGroupSelect(ungroupedTags.map((t) => t.id))}
                    aria-label="Select all ungrouped tags"
                    className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                    Ungrouped — {ungroupedTags.length} tag{ungroupedTags.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <UngroupedDropZone>
                  {ungroupedTags.map((tag) => <TagRow key={tag.id} tag={tag} />)}
                </UngroupedDropZone>
              </>
            )}
          </div>
        )}
      </div>
    </div>
    <DragOverlay>
      {activeTagId ? (() => {
        const tag = tagDefinitions.find((t) => t.id === activeTagId)
        return tag ? (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-white px-4 py-3 shadow-lg text-sm font-semibold text-[var(--text)] opacity-90">
            <span className="h-3 w-3 rounded-full shrink-0" style={{ background: tag.color }} />
            {tag.label}
          </div>
        ) : null
      })() : null}
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
  const [activeTab, setActiveTab] = useState<'code' | 'list' | 'manage'>('code')
  const [tagDefinitions, setTagDefinitions] = useState<TagDefinition[]>(initialTags)
  const [tagIdsByAnswer, setTagIdsByAnswer] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(answers.map((a) => [a.answerId, a.tags.map((t) => t.id)]))
  )
  const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null)
  const [savingTagId, setSavingTagId] = useState<string | null>(null)

  const [batchOpen, setBatchOpen] = useState(false)
  const [batchScope, setBatchScope] = useState<'untagged' | 'all'>('untagged')
  const [batchMode, setBatchMode] = useState<'apply' | 'explore'>('explore')
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 })
  const [batchSummary, setBatchSummary] = useState<{ total: number; tagsApplied: number; firstError?: string } | null>(null)
  const liveTagsRef = useRef<TagDefinition[]>(initialTags)

  const tagById = useMemo(() => new Map(tagDefinitions.map((t) => [t.id, t])), [tagDefinitions])
  liveTagsRef.current = tagDefinitions

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
    }
    setTagDefinitions((prev) => {
      const without = prev.filter((t) => t.id !== newTag.id && t.label !== newTag.label)
      return [...without, newTag].sort((a, b) => a.label.localeCompare(b.label))
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

  async function createTag(label: string, color: string): Promise<TagDefinition | null> {
    const finalLabel = normalizeLabel(label)
    if (!finalLabel) return null
    setSavingTagId('new')
    const result = await createQuestionTag(studyId, questionId, finalLabel, color)
    setSavingTagId(null)
    if (!result?.tag) return null
    const newTag: TagDefinition = {
      id: result.tag.id,
      label: result.tag.label,
      color: result.tag.color,
      parentId: null,
      description: null,
    }
    setTagDefinitions((prev) => {
      const without = prev.filter((t) => t.id !== newTag.id && t.label !== newTag.label)
      return [...without, newTag].sort((a, b) => a.label.localeCompare(b.label))
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
          .sort((a, b) => a.label.localeCompare(b.label))
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

  async function updateDescription(tagId: string, description: string) {
    const result = await updateTagDescription(studyId, tagId, description)
    if (result?.success) {
      setTagDefinitions((prev) => prev.map((t) => t.id === tagId ? { ...t, description: description || null } : t))
    }
  }

  async function runBatchTag() {
    // Only apply to leaf tags
    const leafTags = liveTagsRef.current.filter((t) => t.parentId !== null || !liveTagsRef.current.some((c) => c.parentId === t.id))

    const toProcess = batchScope === 'untagged'
      ? answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).length === 0)
      : answers

    if (!toProcess.length) return

    setBatchRunning(true)
    setBatchSummary(null)
    setBatchProgress({ done: 0, total: toProcess.length })

    let tagsApplied = 0
    let firstError: string | undefined

    for (const answer of toProcess) {
      const currentLeafTags = leafTags
      const result = await suggestTagsWithAI(
        answer.answer,
        currentLeafTags.map((t) => ({ id: t.id, label: t.label })),
        batchMode,
      )

      if ('error' in result && result.error && !firstError) firstError = result.error as string
      const existingIds = tagIdsByAnswer[answer.answerId] ?? []
      const validTagIds = new Set(currentLeafTags.map((t) => t.id))
      const toAdd = result.apply.filter((id) => validTagIds.has(id) && !existingIds.includes(id))
      let nextIds = [...existingIds, ...toAdd]

      for (const label of result.new_tags) {
        const color = DEFAULT_COLORS[liveTagsRef.current.length % DEFAULT_COLORS.length]
        const tagResult = await createQuestionTag(studyId, questionId, normalizeLabel(label), color)
        if (tagResult?.tag) {
          const newTag: TagDefinition = {
            id: tagResult.tag.id,
            label: tagResult.tag.label,
            color: tagResult.tag.color,
            parentId: null,
            description: null,
          }
          const updated = [
            ...liveTagsRef.current.filter((t) => t.id !== newTag.id && t.label !== newTag.label),
            newTag,
          ].sort((a, b) => a.label.localeCompare(b.label))
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

      setBatchProgress((prev) => ({ ...prev, done: prev.done + 1 }))
    }

    setBatchRunning(false)
    setBatchSummary({ total: toProcess.length, tagsApplied, firstError })
    router.refresh()
  }

  const untaggedCount = answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).length === 0).length

  return (
    <div className="space-y-4">
      {/* Auto-tag panel */}
      <div className="rounded-xl border border-[var(--border)] bg-white">
        <button
          type="button"
          onClick={() => { setBatchOpen((o) => !o); setBatchSummary(null) }}
          className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--text)]"
        >
          <span className="text-[var(--accent)]">✦</span>
          <span className="flex-1 text-left">Auto-tag all answers with AI</span>
          <span className="text-xs text-[var(--text-tertiary)]">{batchOpen ? '▲' : '▼'}</span>
        </button>

        {batchOpen && (
          <div className="border-t border-[var(--border-subtle)] px-4 pb-5 pt-4 space-y-4">

            {batchRunning ? (
              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-all"
                    style={{ width: `${batchProgress.total ? (batchProgress.done / batchProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-sm text-[var(--text-tertiary)]">
                  {batchProgress.done} / {batchProgress.total} answers processed…
                </p>
              </div>
            ) : batchSummary ? (
              <div className="space-y-3">
                {batchSummary.firstError && (
                  <p className="rounded-lg px-3 py-2.5 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', border: '1px solid var(--danger-border)' }}>
                    Error: {batchSummary.firstError}
                  </p>
                )}
                {batchSummary.tagsApplied > 0 ? (
                  <p className="text-sm font-semibold" style={{ color: 'var(--success-text)' }}>
                    Done — {batchSummary.tagsApplied} tags applied across {batchSummary.total} answers
                  </p>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">
                    Processed {batchSummary.total} answers but found nothing to tag.
                    {batchMode === 'apply' && tagDefinitions.length === 0 && ' No existing tags to apply — switch to Explore mode.'}
                    {batchMode === 'apply' && tagDefinitions.length > 0 && ' Try Explore mode to generate new tags from the answers.'}
                  </p>
                )}
                <Button tone="secondary" size="sm" onClick={() => setBatchSummary(null)}>
                  Tag again
                </Button>
              </div>
            ) : (
              <>
                {/* Options grid */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Scope */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Which answers</p>
                    <div className="space-y-1">
                      {([
                        { value: 'untagged' as const, label: 'Untagged only', count: untaggedCount },
                        { value: 'all' as const, label: 'All answers', count: answers.length },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setBatchScope(opt.value)}
                          className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                            batchScope === opt.value
                              ? 'border-[var(--accent-muted)] bg-[var(--accent-subtle)] font-semibold text-[var(--accent)]'
                              : 'border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]'
                          }`}
                        >
                          <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${batchScope === opt.value ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-strong)]'}`} />
                          {opt.label}
                          <span className="ml-auto tabular-nums text-xs opacity-60">{opt.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mode */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">AI mode</p>
                    <div className="space-y-1">
                      {([
                        { value: 'explore' as const, label: 'Explore', desc: 'Create new tag names' },
                        { value: 'apply' as const, label: 'Apply', desc: 'Match existing tags only' },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setBatchMode(opt.value)}
                          className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                            batchMode === opt.value
                              ? 'border-[var(--accent-muted)] bg-[var(--accent-subtle)] font-semibold text-[var(--accent)]'
                              : 'border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]'
                          }`}
                        >
                          <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${batchMode === opt.value ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-strong)]'}`} />
                          <span>
                            {opt.label}
                            <span className="ml-1.5 text-xs font-normal opacity-60">{opt.desc}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {batchMode === 'apply' && tagDefinitions.length === 0 && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm" style={{ color: 'var(--warning-text)' }}>
                    No existing tags to apply. Switch to Explore or create some tags first.
                  </p>
                )}

                <Button
                  tone="primary"
                  size="md"
                  onClick={() => void runBatchTag()}
                  disabled={batchMode === 'apply' && tagDefinitions.length === 0}
                >
                  Tag {batchScope === 'untagged' ? untaggedCount : answers.length} answers
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        {([
          { value: 'code', label: 'Code' },
          { value: 'list', label: 'List' },
          { value: 'manage', label: 'Manage tags' },
        ] as { value: 'code' | 'list' | 'manage'; label: string }[]).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveTab(value)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === value
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'code' ? (
        <CodeTab
          answers={answers}
          tagDefinitions={tagDefinitions}
          tagIdsByAnswer={tagIdsByAnswer}
          tagById={tagById}
          savingAnswerId={savingAnswerId}
          savingTagId={savingTagId}
          onApply={applyTag}
          onCreateAndApply={createAndApplyTag}
          onRemove={removeTag}
        />
      ) : activeTab === 'list' ? (
        <ListView
          answers={answers}
          tagDefinitions={tagDefinitions}
          tagIdsByAnswer={tagIdsByAnswer}
          tagById={tagById}
          savingAnswerId={savingAnswerId}
          savingTagId={savingTagId}
          onApply={applyTag}
          onCreateAndApply={createAndApplyTag}
          onRemove={removeTag}
        />
      ) : (
        <ManageTab
          studyId={studyId}
          questionId={questionId}
          tagDefinitions={tagDefinitions}
          tagIdsByAnswer={tagIdsByAnswer}
          answers={answers}
          savingTagId={savingTagId}
          onRename={renameTag}
          onDelete={deleteTag}
          onCreate={createTag}
          onMoveToTheme={moveTagToTheme}
          onUpdateDescription={updateDescription}
        />
      )}
    </div>
  )
}
