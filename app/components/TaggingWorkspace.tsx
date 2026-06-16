'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createQuestionTag,
  deleteQuestionTag,
  mergeQuestionTags,
  suggestTagsWithAI,
  updateAnswerTags,
  updateQuestionTag,
} from '@/app/actions/analysis'
import { Button, IconButton, TextInput, TrashIcon } from '@/app/components/ui'
import SelectMenu from '@/app/components/SelectMenu'

// ─── Types ───────────────────────────────────────────────────────────────────

type TagDefinition = { id: string; label: string; color: string }
type Answer = {
  entryId: string
  participantName: string
  participantEmail: string
  date: string
  submittedAt: string
  answerId: string
  answer: string
  tags: TagDefinition[]
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
// Colored chip (non-interactive) with a separate remove button inside.

function AppliedTagChip({ tag, onRemove, size = 'md' }: {
  tag: TagDefinition
  onRemove: () => void
  size?: 'sm' | 'md'
}) {
  const textColor = readableTextColor(tag.color)
  const sm = size === 'sm'
  return (
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

  const suggestions = useMemo(() => {
    if (!value.trim()) return []
    const q = value.toLowerCase()
    return tags.filter((t) => !appliedTagIds.includes(t.id) && t.label.toLowerCase().includes(q))
  }, [value, tags, appliedTagIds])

  function commit(tag: TagDefinition | null, raw: string) {
    if (tag) {
      onApply(tag.id)
    } else {
      const label = normalizeLabel(raw)
      if (!label) return
      const exact = tags.find((t) => t.label.toLowerCase() === label.toLowerCase())
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

  const exactMatch = value.trim() && tags.some((t) => t.label.toLowerCase() === value.trim().toLowerCase())

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
          {suggestions.slice(0, 8).map((tag, i) => (
            <button
              key={tag.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commit(tag, tag.label) }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                i === cursor ? 'bg-[var(--accent-subtle)] text-[var(--text-link)]' : 'text-[var(--text)] hover:bg-[var(--bg-sunken)]'
              }`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
              {tag.label}
            </button>
          ))}
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
          className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
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
      result = result.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).includes(filterTagId))
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
  }, [answers, filterType, filterTagId, filterEmail, sortBy, tagIdsByAnswer, tagById])

  const totalUntagged = useMemo(
    () => answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).length === 0).length,
    [answers, tagIdsByAnswer],
  )

  const safeIndex = Math.min(cardIndex, Math.max(0, filtered.length - 1))
  const current = filtered[safeIndex] ?? null
  const currentTagIds = current ? (tagIdsByAnswer[current.answerId] ?? []) : []
  const currentTags = currentTagIds.map((id) => tagById.get(id)).filter(Boolean) as TagDefinition[]

  async function runSuggest() {
    if (!current) return
    setSuggesting(true)
    setAiResult(null)
    lastSuggestedAnswerId.current = current.answerId
    try {
      const result = await suggestTagsWithAI(
        current.answer,
        tagDefinitions.map((t) => ({ id: t.id, label: t.label })),
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

  const tagOptions = tagDefinitions.map((t) => ({ value: t.id, label: t.label }))
  const participantOptions = participants.map((p) => ({ value: p.email, label: p.name }))
  const sortOptions: { value: SortBy; label: string }[] = [
    { value: 'date', label: 'Date' },
    { value: 'size', label: 'Length' },
    { value: 'tag', label: 'Tag' },
    { value: 'participant', label: 'Participant' },
  ]

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
            value={filterTagId || (tagOptions[0]?.value ?? '')}
            options={[{ value: '', label: 'Pick a tag…' }, ...tagOptions]}
            onChange={(v) => { setFilterTagId(v); setCardIndex(0) }}
            buttonClassName="h-9 rounded-lg text-sm"
            className="w-44"
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
            {currentTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {currentTags.map((tag) => (
                  <AppliedTagChip
                    key={tag.id}
                    tag={tag}
                    onRemove={() => onRemove(current.answerId, tag.id)}
                  />
                ))}
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
              const available = tagDefinitions.filter((t) => !currentTagIds.includes(t.id) && !suggestedIds.has(t.id))
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

  const filtered = useMemo(() => {
    if (tagFilter === 'all') return answers
    if (tagFilter === 'untagged') return answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).length === 0)
    return answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).includes(tagFilter))
  }, [answers, tagFilter, tagIdsByAnswer])

  const untaggedCount = useMemo(
    () => answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).length === 0).length,
    [answers, tagIdsByAnswer],
  )

  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'untagged', label: 'Untagged' },
    ...tagDefinitions.map((t) => ({ value: t.id, label: t.label })),
  ]

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          options={filterOptions}
          value={tagFilter}
          onChange={(v) => { setTagFilter(v); setVisibleCount(15) }}
        />
        {untaggedCount > 0 && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-800">
            {untaggedCount} untagged
          </span>
        )}
        <span className="text-sm text-[var(--text-tertiary)]">
          {filtered.length} {filtered.length === 1 ? 'answer' : 'answers'}
        </span>
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
              const available = tagDefinitions.filter((t) => !currentTagIds.includes(t.id))
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
                    {currentTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {currentTags.map((tag) => (
                          <AppliedTagChip
                            key={tag.id}
                            tag={tag}
                            size="sm"
                            onRemove={() => onRemove(answer.answerId, tag.id)}
                          />
                        ))}
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

// ─── ManageTab ────────────────────────────────────────────────────────────────

function ManageTab({
  tagDefinitions,
  tagIdsByAnswer,
  savingTagId,
  onRename,
  onDelete,
  onMerge,
  onCreate,
}: {
  tagDefinitions: TagDefinition[]
  tagIdsByAnswer: Record<string, string[]>
  savingTagId: string | null
  onRename: (tagId: string, label: string, color: string) => void
  onDelete: (tagId: string) => void
  onMerge: (sourceIds: string[], label: string, color: string) => Promise<{ success?: boolean } | null | undefined>
  onCreate: (label: string, color: string) => Promise<TagDefinition | null>
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mergeLabel, setMergeLabel] = useState('')
  const [mergeColor, setMergeColor] = useState(DEFAULT_COLORS[0])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0])

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ids of Object.values(tagIdsByAnswer)) {
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
  }, [tagIdsByAnswer])

  const mergeAffectedCount = useMemo(() => {
    const answerIds = new Set<string>()
    for (const [answerId, ids] of Object.entries(tagIdsByAnswer)) {
      if (ids.some((id) => selectedIds.has(id))) answerIds.add(answerId)
    }
    return answerIds.size
  }, [tagIdsByAnswer, selectedIds])

  function toggleSelect(tagId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(tagId) ? next.delete(tagId) : next.add(tagId)
      return next
    })
  }

  async function confirmMerge() {
    const result = await onMerge([...selectedIds], mergeLabel, mergeColor)
    if (result?.success) {
      setSelectedIds(new Set())
      setMergeLabel('')
      setMergeColor(DEFAULT_COLORS[0])
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

  async function handleCreate() {
    const label = normalizeLabel(newLabel)
    if (!label) return
    await onCreate(label, newColor)
    setNewLabel('')
    setNewColor(DEFAULT_COLORS[tagDefinitions.length % DEFAULT_COLORS.length])
  }

  return (
    <div className="space-y-4">
      {/* New tag */}
      <div className="flex gap-2">
        <TextInput
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreate() } }}
          placeholder="New tag name"
          className="h-9 py-0"
        />
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          aria-label="Tag color"
          className="h-9 w-10 cursor-pointer rounded-lg border border-[var(--border-strong)] bg-white p-1"
        />
        <Button
          tone="primary"
          size="sm"
          onClick={() => void handleCreate()}
          disabled={!newLabel.trim() || savingTagId === 'new'}
        >
          {savingTagId === 'new' ? 'Adding…' : 'Add tag'}
        </Button>
      </div>

      {/* Tags list */}
      <div className="rounded-xl border border-[var(--border)] bg-white">
        {tagDefinitions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--text-tertiary)]">No tags yet. Create one above.</p>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {tagDefinitions.map((tag) => {
              const count = tagCounts.get(tag.id) ?? 0
              const isRenaming = renamingId === tag.id
              const isSelected = selectedIds.has(tag.id)
              const isConfirmingDelete = confirmDeleteId === tag.id

              return (
                <div
                  key={tag.id}
                  className={`flex items-center gap-3 px-4 py-3 ${isSelected ? 'bg-[var(--accent-subtle)]' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(tag.id)}
                    aria-label={`Select ${tag.label} for merge`}
                    className="h-4 w-4 rounded accent-[var(--accent)]"
                  />
                  <input
                    type="color"
                    value={tag.color}
                    onChange={(e) => onRename(tag.id, tag.label, e.target.value)}
                    aria-label={`${tag.label} color`}
                    className="h-7 w-8 cursor-pointer rounded border border-[var(--border)] bg-white p-0.5"
                  />
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void commitRename(tag)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); void commitRename(tag) }
                        if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') }
                      }}
                      className="flex-1 rounded-lg border border-[var(--border-focus)] bg-white px-2 py-1 text-sm text-[var(--text)] outline-none ring-2 ring-[var(--accent-ring)]"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startRename(tag)}
                      title="Click to rename"
                      className="flex-1 text-left text-sm font-semibold text-[var(--text)] hover:text-[var(--text-link)]"
                    >
                      {tag.label}
                    </button>
                  )}
                  <span className="shrink-0 text-sm tabular-nums text-[var(--text-tertiary)]">
                    {count} {count === 1 ? 'answer' : 'answers'}
                  </span>
                  {isConfirmingDelete ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        tone="danger"
                        size="sm"
                        onClick={() => { void onDelete(tag.id); setConfirmDeleteId(null) }}
                      >
                        Delete
                      </Button>
                      <Button
                        tone="secondary"
                        size="sm"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <IconButton
                      tone="trash"
                      label={`Delete ${tag.label}`}
                      onClick={() => count > 0 ? setConfirmDeleteId(tag.id) : void onDelete(tag.id)}
                      disabled={savingTagId === tag.id}
                      className="h-8 w-8 shrink-0"
                    >
                      <TrashIcon />
                    </IconButton>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Merge panel */}
      {selectedIds.size >= 2 && (
        <div className="rounded-xl border border-[var(--accent-muted)] bg-[var(--accent-subtle)] p-4">
          <p className="mb-1 text-sm font-semibold text-[var(--text)]">
            Merge {selectedIds.size} tags — {mergeAffectedCount} {mergeAffectedCount === 1 ? 'answer' : 'answers'} will be re-tagged
          </p>
          <p className="mb-3 text-xs text-[var(--text-secondary)]">
            {tagDefinitions.filter((t) => selectedIds.has(t.id)).map((t) => t.label).join(', ')}
          </p>
          <div className="flex flex-wrap gap-2">
            <TextInput
              value={mergeLabel}
              onChange={(e) => setMergeLabel(e.target.value)}
              placeholder="Merged tag name…"
              className="h-9 min-w-40 flex-1 py-0"
            />
            <input
              type="color"
              value={mergeColor}
              onChange={(e) => setMergeColor(e.target.value)}
              aria-label="Merged tag color"
              className="h-9 w-10 cursor-pointer rounded-lg border border-[var(--border-strong)] bg-white p-1"
            />
            <Button
              tone="primary"
              size="sm"
              onClick={() => void confirmMerge()}
              disabled={!mergeLabel.trim() || savingTagId === 'merge'}
            >
              {savingTagId === 'merge' ? 'Merging…' : 'Merge'}
            </Button>
            <Button
              tone="secondary"
              size="sm"
              onClick={() => { setSelectedIds(new Set()); setMergeLabel(''); setMergeColor(DEFAULT_COLORS[0]) }}
            >
              Cancel
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {tagDefinitions.filter((t) => selectedIds.has(t.id)).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setMergeLabel(t.label); setMergeColor(t.color) }}
                className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]"
              >
                Keep &ldquo;{t.label}&rdquo;
              </button>
            ))}
          </div>
        </div>
      )}
      {selectedIds.size === 1 && (
        <p className="text-center text-xs text-[var(--text-tertiary)]">Select one more tag to merge</p>
      )}
    </div>
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
    setTagDefinitions((prev) => {
      const without = prev.filter((t) => t.id !== result.tag.id && t.label !== result.tag.label)
      return [...without, result.tag].sort((a, b) => a.label.localeCompare(b.label))
    })
    const current = tagIdsByAnswer[answerId] ?? []
    if (!current.includes(result.tag.id)) {
      const nextIds = [...current, result.tag.id]
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

  async function createTag(label: string, color: string) {
    const finalLabel = normalizeLabel(label)
    if (!finalLabel) return null
    setSavingTagId('new')
    const result = await createQuestionTag(studyId, questionId, finalLabel, color)
    setSavingTagId(null)
    if (!result?.tag) return null
    setTagDefinitions((prev) => {
      const without = prev.filter((t) => t.id !== result.tag.id && t.label !== result.tag.label)
      return [...without, result.tag].sort((a, b) => a.label.localeCompare(b.label))
    })
    router.refresh()
    return result.tag as TagDefinition
  }

  async function renameTag(tagId: string, label: string, color: string) {
    setSavingTagId(tagId)
    const result = await updateQuestionTag(studyId, tagId, { label, color })
    setSavingTagId(null)
    if (result?.tag) {
      setTagDefinitions((prev) =>
        prev.map((t) => t.id === tagId ? result.tag : t).sort((a, b) => a.label.localeCompare(b.label))
      )
      router.refresh()
    }
  }

  async function deleteTag(tagId: string) {
    setSavingTagId(tagId)
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

  async function mergeTags(
    sourceIds: string[],
    resultLabel: string,
    resultColor: string,
  ): Promise<{ success?: boolean } | null | undefined> {
    setSavingTagId('merge')
    const result = await mergeQuestionTags(studyId, questionId, sourceIds, resultLabel, resultColor)
    setSavingTagId(null)
    if (!result?.tag) return result as { success?: boolean } | null | undefined
    const mergedTag = result.tag as TagDefinition
    setTagDefinitions((prev) => {
      const without = prev.filter((t) => !sourceIds.includes(t.id) || t.id === mergedTag.id)
      const hasTarget = without.some((t) => t.id === mergedTag.id)
      const updated = hasTarget
        ? without.map((t) => t.id === mergedTag.id ? mergedTag : t)
        : [...without, mergedTag]
      return updated.sort((a, b) => a.label.localeCompare(b.label))
    })
    setTagIdsByAnswer((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([aid, ids]) => {
          const hasSource = ids.some((id) => sourceIds.includes(id))
          if (!hasSource) return [aid, ids]
          const without = ids.filter((id) => !sourceIds.includes(id))
          return [aid, [...new Set([...without, mergedTag.id])]]
        })
      )
    )
    router.refresh()
    return result as { success?: boolean }
  }

  async function runBatchTag() {
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
      const currentTags = liveTagsRef.current
      const result = await suggestTagsWithAI(
        answer.answer,
        currentTags.map((t) => ({ id: t.id, label: t.label })),
        batchMode,
      )

      if ('error' in result && result.error && !firstError) firstError = result.error as string
      const existingIds = tagIdsByAnswer[answer.answerId] ?? []
      const validTagIds = new Set(currentTags.map((t) => t.id))
      const toAdd = result.apply.filter((id) => validTagIds.has(id) && !existingIds.includes(id))
      let nextIds = [...existingIds, ...toAdd]

      for (const label of result.new_tags) {
        const color = DEFAULT_COLORS[liveTagsRef.current.length % DEFAULT_COLORS.length]
        const tagResult = await createQuestionTag(studyId, questionId, normalizeLabel(label), color)
        if (tagResult?.tag) {
          const newTag = tagResult.tag as TagDefinition
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
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--text)]"
        >
          <span className="text-[var(--accent)]">✦</span> Auto-tag all answers with AI
          <span className="text-xs text-[var(--text-tertiary)]">{batchOpen ? '▲' : '▼'}</span>
        </button>

        {batchOpen && (
          <div className="border-t border-[var(--border-subtle)] px-4 pb-4 pt-3 space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--text-tertiary)]">Tag</span>
                <SegmentedControl
                  options={[
                    { value: 'untagged' as const, label: `Untagged only (${untaggedCount})` },
                    { value: 'all' as const, label: `All answers (${answers.length})` },
                  ]}
                  value={batchScope}
                  onChange={setBatchScope}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--text-tertiary)]">Mode</span>
                <SegmentedControl
                  options={[
                    { value: 'apply' as const, label: 'Apply' },
                    { value: 'explore' as const, label: 'Explore' },
                  ]}
                  value={batchMode}
                  onChange={setBatchMode}
                />
              </div>
            </div>

            {batchMode === 'apply' && tagDefinitions.length === 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm" style={{ color: 'var(--warning-text)' }}>
                Apply mode needs at least one tag to exist. Create some tags first, or switch to Explore mode.
              </p>
            )}

            {batchRunning ? (
              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-all"
                    style={{ width: `${batchProgress.total ? (batchProgress.done / batchProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-sm text-[var(--text-tertiary)]">
                  {batchProgress.done} / {batchProgress.total} answers — {batchProgress.done === 0 ? 'starting…' : 'tagging…'}
                </p>
              </div>
            ) : batchSummary ? (
              <div className="space-y-2">
                {batchSummary.firstError && (
                  <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', border: '1px solid var(--danger-border)' }}>
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
                    {batchMode === 'apply' && tagDefinitions.length === 0 && ' Switch to Explore mode — there are no existing tags to apply.'}
                    {batchMode === 'apply' && tagDefinitions.length > 0 && ' The AI did not match any existing tags. Try Explore mode to generate new tags from the answers.'}
                  </p>
                )}
                <Button tone="secondary" size="sm" onClick={() => setBatchSummary(null)}>
                  Tag again
                </Button>
              </div>
            ) : (
              <Button
                tone="primary"
                size="sm"
                onClick={() => void runBatchTag()}
                disabled={batchMode === 'apply' && tagDefinitions.length === 0}
              >
                Tag {batchScope === 'untagged' ? untaggedCount : answers.length} answers
              </Button>
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
          tagDefinitions={tagDefinitions}
          tagIdsByAnswer={tagIdsByAnswer}
          savingTagId={savingTagId}
          onRename={renameTag}
          onDelete={deleteTag}
          onMerge={mergeTags}
          onCreate={createTag}
        />
      )}
    </div>
  )
}
