'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
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
import SelectMenu from '@/app/components/SelectMenu'

// ─── Types ───────────────────────────────────────────────────────────────────

type TagDefinition = {
  id: string
  label: string
  color: string
  parentId: string | null
  description: string | null
  sortOrder: number
  isTheme: boolean
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

type AnswerSortBy = 'newest' | 'oldest' | 'name-az' | 'longest' | 'shortest'
type InsertionIndicator = { tagId: string; position: 'before' | 'after' } | null
type SaveNotice = { tone: 'success' | 'error'; message: string } | null
type FilterOption = { value: string; label: string; color?: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_COLORS = ['#4f46e5', '#0d9488', '#d97706', '#7c3aed', '#e11d48', '#0891b2']
const UNTAGGED_FILTER = '__without_tags__'

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

function sortTags(tags: TagDefinition[]) {
  return [...tags].sort((a, b) => (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label))
}

function tagGroup(tags: TagDefinition[], parentId: string | null) {
  return sortTags(tags.filter((tag) => tag.parentId === parentId))
}

function isThemeTag(tag: TagDefinition) {
  return tag.isTheme
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 2l4 4-4 4" />
    </svg>
  )
}

function MultiSelectMenu({
  values,
  options,
  placeholder,
  onToggle,
  onClear,
  buttonClassName = '',
}: {
  values: string[]
  options: FilterOption[]
  placeholder: string
  onToggle: (value: string) => void
  onClear: () => void
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const valueSet = useMemo(() => new Set(values), [values])
  const selectedOptions = options.filter((option) => valueSet.has(option.value))
  const label = selectedOptions.length === 0
    ? placeholder
    : selectedOptions.length === 1
      ? selectedOptions[0].label
      : `${selectedOptions.length} filters selected`

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
        className={`interactive-press flex h-11 w-full items-center justify-between gap-3 rounded-xl border bg-[var(--bg-sunken)] px-3 text-left text-sm text-[var(--text)] ${
          open ? 'border-[var(--accent)] bg-white ring-2 ring-[var(--accent-ring)]' : 'border-[var(--border-strong)] hover:bg-white'
        } ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" className="control-menu absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-auto p-1">
          {values.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="mb-1 flex min-h-9 w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
            >
              Clear filters
            </button>
          )}
          {options.map((option) => {
            const selected = valueSet.has(option.value)
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onToggle(option.value)}
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? 'bg-[var(--accent-subtle)] font-semibold text-[var(--accent-active)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]'
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border-strong)] bg-white'}`}>
                  {selected && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M2.5 6.2 4.8 8.5 9.5 3.5" />
                    </svg>
                  )}
                </span>
                {option.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />}
                <span className="truncate">{option.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
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
    return !isThemeTag(t)
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
      if (exact) onApply(exact.id)
      else onCreate(label)
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

// ─── AIProposalPanel ──────────────────────────────────────────────────────────

type ProposedTheme = {
  tempId: string
  name: string
  description: string
  tagIds: string[]
  color: string
}

function AIProposalPanel({
  proposal,
  tagById,
  allTagIds,
  answers,
  tagIdsByAnswer,
  onApply,
  onCancel,
}: {
  proposal: ProposedTheme[]
  tagById: Map<string, TagDefinition>
  allTagIds: Set<string>
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

      <div className="space-y-2">
        {themes.map((theme) => (
          <div key={theme.tempId} className="overflow-hidden rounded-xl border border-[var(--border-strong)] bg-white shadow-[var(--shadow-sm)]">
            {/* Theme name row */}
            <div className="flex items-start gap-3 border-l-4 bg-white px-4 py-3.5" style={{ borderLeftColor: theme.color }}>
              <span className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-md ring-1 ring-black/10" style={{ backgroundColor: theme.color }} />
              {renamingId === theme.tempId ? (
                <input
                  autoFocus
                  value={theme.name}
                  onChange={(e) => renameTheme(theme.tempId, e.target.value)}
                  onBlur={() => setRenamingId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') setRenamingId(null)
                  }}
                  className="flex-1 rounded-lg border border-[var(--border-focus)] bg-white px-2 py-1 text-sm font-bold text-[var(--text)] outline-none ring-2 ring-[var(--accent-ring)]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setRenamingId(theme.tempId)}
                  className="flex-1 text-left text-[15px] font-bold leading-snug text-[var(--text)] hover:text-[var(--text-link)]"
                  title="Click to rename"
                >
                  {theme.name || <span className="text-[var(--text-tertiary)] italic">Unnamed theme</span>}
                </button>
              )}
              <span className="mt-1 shrink-0 text-xs text-[var(--text-tertiary)] whitespace-nowrap">{theme.tagIds.length} tag{theme.tagIds.length !== 1 ? 's' : ''}</span>
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

            <div className="space-y-3 bg-[var(--bg-sunken)] px-4 py-3">
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
                  className="w-full text-left text-xs text-[var(--text-secondary)] hover:text-[var(--text)] italic"
                  title="Click to edit description"
                >
                  {theme.description || <span className="text-[var(--text-tertiary)] not-italic">Add description…</span>}
                </button>
              )}

              {/* Sub-tags */}
              <div className="divide-y divide-[var(--border-subtle)]">
                {theme.tagIds.map((tagId) => {
                  const tag = tagById.get(tagId)
                  if (!tag) return null
                  return (
                    <div key={tagId} className="flex items-center gap-3 py-2.5">
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: tag.color }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">{tag.label}</span>
                      <button
                        type="button"
                        onClick={() => removeSubTag(theme.tempId, tagId)}
                        aria-label={`Remove ${tag.label} from theme`}
                        className="rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--danger-text)]"
                      >
                        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </div>
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
                  buttonClassName="h-8 text-sm bg-white"
                  className="w-64"
                />
              )}
            </div>
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
  onRename: (id: string, label: string, color: string) => void
  startRename: (tag: TagDefinition) => void
  startEditDesc: (tag: TagDefinition) => void
  expandedTagIds: Set<string>
  toggleTagExpand: (id: string) => void
  insertionIndicator: InsertionIndicator
  activeDragIds: string[]
  landedTagIds: Set<string>
  onKeyboardReorder: (tagId: string, direction: 'up' | 'down') => void
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

function ThemeDropZone({ themeId, themeLabel, active, children }: { themeId: string; themeLabel: string; active: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `theme-${themeId}` })
  return (
    <div ref={setNodeRef} className={`relative rounded-xl border border-[var(--border-strong)] bg-white shadow-[var(--shadow-sm)] transition-colors ${isOver || active ? 'bg-[var(--accent-subtle)] ring-2 ring-inset ring-[var(--accent-muted)]' : ''}`}>
      {(isOver || active) && (
        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-md border border-[var(--accent-muted)] bg-white px-2 py-1 text-xs font-semibold text-[var(--text-link)] shadow-[var(--shadow-sm)]">
          Move to {themeLabel}
        </div>
      )}
      {children}
    </div>
  )
}

function ThemeChildren({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-b-xl bg-[var(--bg-sunken)] px-4 py-1">
      {children}
    </div>
  )
}

function UngroupedDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'ungrouped' })
  return (
    <div ref={setNodeRef} className={`relative space-y-2 transition-colors ${isOver ? 'rounded-xl bg-[var(--accent-subtle)] ring-2 ring-inset ring-[var(--accent-muted)]' : ''}`}>
      {isOver && (
        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-md border border-[var(--accent-muted)] bg-white px-2 py-1 text-xs font-semibold text-[var(--text-link)] shadow-[var(--shadow-sm)]">
          Move back to tags
        </div>
      )}
      {children}
    </div>
  )
}

function TagRow({ tag, isIndented }: { tag: TagDefinition; isIndented?: boolean }) {
  const ctx = useManageCtx()
  const [showDragHandle, setShowDragHandle] = useState(false)
  const { attributes, listeners, setNodeRef: setDraggableNodeRef, isDragging } = useDraggable({ id: `tag-${tag.id}` })
  const { setNodeRef: setDroppableNodeRef } = useDroppable({ id: `row-${tag.id}` })
  const setRowRef = (node: HTMLDivElement | null) => {
    setDraggableNodeRef(node)
    setDroppableNodeRef(node)
  }

  const isRenaming = ctx.renamingId === tag.id
  const isEditingDesc = ctx.editingDescId === tag.id
  const count = ctx.tagCounts.get(tag.id) ?? 0
  const insertionPosition = ctx.insertionIndicator?.tagId === tag.id ? ctx.insertionIndicator.position : null
  const isPartOfDrag = ctx.activeDragIds.includes(tag.id)
  const isLanding = ctx.landedTagIds.has(tag.id)
  const isExpanded = ctx.expandedTagIds.has(tag.id)

  return (
    <div
      onMouseEnter={() => setShowDragHandle(true)}
      onMouseLeave={() => setShowDragHandle(false)}
      className={`group relative ${isIndented ? '' : 'lg:-ml-11 lg:pl-11'}`}
    >
      {insertionPosition && (
        <div
          className={`pointer-events-none absolute left-0 right-0 z-20 lg:right-0 ${isIndented ? 'lg:left-0' : 'lg:left-11'} ${insertionPosition === 'before' ? '-top-1.5' : '-bottom-1.5'}`}
          aria-hidden
        >
          <div className="h-1 rounded-full bg-[var(--accent)] shadow-[0_0_0_3px_var(--accent-subtle)]" />
        </div>
      )}
      <div
        ref={setRowRef}
        className={`flex items-center gap-3 transition-[background-color,border-color,box-shadow,opacity] duration-200 ${isIndented ? `border-b border-[var(--border-subtle)] px-0 py-2.5 ${isLanding ? 'bg-[var(--accent-subtle)] shadow-[inset_0_0_0_1px_var(--accent-muted)]' : 'bg-transparent'}` : `rounded-xl border px-4 py-3 ${isLanding ? 'border-[var(--accent-muted)] bg-[var(--accent-subtle)] shadow-[inset_0_0_0_1px_var(--accent-muted)]' : 'border-[var(--border)] bg-white'}`} ${isDragging || isPartOfDrag ? 'opacity-40' : ''}`}
      >
      {/* Drag handle — always visible because moving tags is a primary organizing action */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Drag topic. Use Alt+Up or Alt+Down to reorder with the keyboard."
        onKeyDown={(event) => {
          if (!event.altKey) return
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            ctx.onKeyboardReorder(tag.id, 'up')
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            ctx.onKeyboardReorder(tag.id, 'down')
          }
        }}
        className={`inline-flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--text-tertiary)] shadow-none transition-colors hover:border-[var(--border)] hover:bg-white hover:text-[var(--text)] hover:opacity-100 focus-visible:border-[var(--border-focus)] focus-visible:bg-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:cursor-grabbing ${isIndented ? '' : 'lg:absolute lg:left-1.5 lg:top-1/2 lg:z-10 lg:-translate-y-1/2'} ${ctx.activeDragIds.length === 0 ? 'group-hover:opacity-60' : ''} ${isPartOfDrag || (showDragHandle && ctx.activeDragIds.length === 0) ? 'opacity-60' : 'opacity-0'}`}
        aria-label={`Drag ${tag.label}`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
      >
        <GripIcon />
      </button>

      {/* Selection checkbox — always visible because deletion and bulk actions use selection */}
      <input
        type="checkbox"
        checked={ctx.selectedTagIds.has(tag.id)}
        onChange={() => ctx.toggleSelect(tag.id)}
        aria-label={`Select ${tag.label}`}
        className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
      />

      {/* Color dot */}
      <label className="relative h-3.5 w-3.5 shrink-0 cursor-pointer" title="Change color">
        <span className="block h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: tag.color }} />
        <input type="color" value={tag.color} onChange={(e) => ctx.onRename(tag.id, tag.label, e.target.value)} aria-label={`${tag.label} color`} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
      </label>

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
            className="group/name inline-flex items-center gap-1 text-left text-sm font-semibold text-[var(--text)] hover:text-[var(--text-link)]"
          >
            {tag.label}
            <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 opacity-0 group-hover/name:opacity-50 transition-opacity" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" /></svg>
          </button>
        )}
        {isExpanded && (
          isEditingDesc ? (
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
              className="group/desc inline-flex items-center gap-1 text-left text-xs text-[var(--text-secondary)] hover:text-[var(--text)] italic"
            >
              {tag.description || <span className="not-italic opacity-50">Add description…</span>}
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover/desc:opacity-50 transition-opacity" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" /></svg>
            </button>
          )
        )}
      </div>

      <button
        type="button"
        onClick={() => ctx.toggleTagExpand(tag.id)}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs tabular-nums transition-colors ${isExpanded ? 'border-[var(--accent-muted)] bg-[var(--accent-subtle)] text-[var(--text-link)]' : 'border-transparent text-[var(--text-tertiary)] hover:border-[var(--border)] hover:bg-white hover:text-[var(--text)]'}`}
        aria-label={isExpanded ? `Collapse answers for ${tag.label}` : `Expand answers for ${tag.label}`}
      >
        <svg viewBox="0 0 12 12" className={`h-3 w-3 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 2l4 4-4 4" /></svg>
        {count} {count === 1 ? 'answer' : 'answers'}
      </button>

      </div>
    </div>
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
  const [untaggedVisibleCount, setUntaggedVisibleCount] = useState(15)
  const [answerSearch, setAnswerSearch] = useState('')
  const [answerSort, setAnswerSort] = useState<AnswerSortBy>('newest')
  const [filterTagIds, setFilterTagIds] = useState<string[]>([])
  const [filterParticipants, setFilterParticipants] = useState<string[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<Set<string>>(new Set())
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
  const leafTagsForApply = useMemo(() => tagDefinitions.filter((t) => !isThemeTag(t)), [tagDefinitions])
  const uniqueParticipants = useMemo(() => [...new Set(answers.map((a) => a.participantName))].sort(), [answers])
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
      base = answers.filter((a) => {
        const answerTagIds = tagIdsByAnswer[a.answerId] ?? []
        if (selectedFilters.has(UNTAGGED_FILTER) && answerTagIds.length === 0) return true
        return answerTagIds.some((id) => selectedFilters.has(id))
      })
    }
    if (filterParticipants.length > 0) {
      const selectedParticipants = new Set(filterParticipants)
      base = base.filter((a) => selectedParticipants.has(a.participantName))
    }
    const search = answerSearch.trim().toLowerCase()
    const filtered = search ? base.filter((a) => a.answer.toLowerCase().includes(search) || a.participantName.toLowerCase().includes(search)) : base
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
  const leafTagCount = leafTagsForApply.length
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

  function toggleAnswerSelect(answerId: string) {
    setSelectedAnswerIds((prev) => {
      const next = new Set(prev)
      if (next.has(answerId)) next.delete(answerId)
      else next.add(answerId)
      return next
    })
  }
  function clearAnswerSelection() { setSelectedAnswerIds(new Set()) }
  function toggleParticipantFilter(value: string) {
    setFilterParticipants((prev) => {
      const next = prev.includes(value) ? prev.filter((name) => name !== value) : [...prev, value]
      return next
    })
    setUntaggedVisibleCount(15)
    clearAnswerSelection()
  }
  function clearParticipantFilters() {
    setFilterParticipants([])
    setUntaggedVisibleCount(15)
    clearAnswerSelection()
  }
  function toggleAnswerTagFilter(value: string) {
    setFilterTagIds((prev) => {
      const next = prev.includes(value) ? prev.filter((id) => id !== value) : [...prev, value]
      return next
    })
    setUntaggedVisibleCount(15)
    clearAnswerSelection()
  }
  function clearAnswerTagFilters() {
    setFilterTagIds([])
    setUntaggedVisibleCount(15)
    clearAnswerSelection()
  }
  function handleAiTagClick() {
    if (batchSummary) {
      onClearBatchSummary()
    }
    const mode = leafTagCount === 0 ? 'explore' : 'apply'
    setBatchMode(mode)
    onRunBatch(aiTagTargetIds, mode)
  }
  async function handleBulkApplyTag(tagId: string) {
    for (const answerId of Array.from(selectedAnswerIds)) await onApply(answerId, tagId)
  }
  async function handleBulkCreateAndApply(label: string) {
    for (const answerId of Array.from(selectedAnswerIds)) await onCreateAndApply(answerId, label)
  }

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

  function TagAnswers({ tag, indent }: { tag: TagDefinition; indent: boolean }) {
    const tagged = answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).includes(tag.id))
    const pl = indent ? 'pl-14' : 'pl-6'
    if (!tagged.length) return <p className={`${pl} pr-4 py-3 text-sm italic text-[var(--text-tertiary)] bg-[var(--bg-sunken)]`}>No answers tagged yet.</p>
    return (
      <div className="divide-y divide-[var(--border-subtle)] bg-[var(--bg-sunken)]">
        {tagged.map((a) => (
          <div key={a.answerId} className={`flex items-start gap-3 ${pl} pr-4 py-3`}>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                <span className="font-medium text-[var(--text-secondary)]">{a.participantName}</span>
                <span>{formatDate(a.submittedAt)}</span>
              </div>
              <p className="text-sm leading-relaxed text-[var(--text)] line-clamp-3">{a.answer}</p>
            </div>
            <button type="button" onClick={() => onRemove(a.answerId, tag.id)} title="Remove tag from answer" className="mt-1 shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--danger-text)]">
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </div>
        ))}
      </div>
    )
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
                          {expandedTagIds.has(tag.id) && <TagAnswers tag={tag} indent />}
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
                {expandedTagIds.has(tag.id) && <TagAnswers tag={tag} indent={false} />}
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

      {/* Answers panel */}
      {answers.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="border-b border-[var(--border-subtle)]">
            {/* Header row: select-all + title + filter/sort icons */}
            <div className="flex items-center gap-2 px-4 py-2.5">
              <input
                type="checkbox"
                checked={displayedAnswers.length > 0 && displayedAnswers.every((a) => selectedAnswerIds.has(a.answerId))}
                ref={(el) => { if (el) el.indeterminate = displayedAnswers.some((a) => selectedAnswerIds.has(a.answerId)) && !displayedAnswers.every((a) => selectedAnswerIds.has(a.answerId)) }}
                onChange={() => {
                  const allSelected = displayedAnswers.every((a) => selectedAnswerIds.has(a.answerId))
                  setSelectedAnswerIds(allSelected ? new Set() : new Set(displayedAnswers.map((a) => a.answerId)))
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
              {/* Filter icon — accent when any filter is active */}
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
              {/* Sort icon — accent when non-default */}
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
                  <MultiSelectMenu
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
                  <MultiSelectMenu
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
                    onChange={(e) => { setAnswerSearch(e.target.value); setUntaggedVisibleCount(15); clearAnswerSelection() }}
                    placeholder="Text or participant name…"
                    className="h-8 w-full rounded-lg border border-[var(--border)] bg-white px-2.5 py-0 text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  />
                </div>
              </div>
            )}
            {/* Sort expand */}
            {sortOpen && (
              <div className="flex items-center gap-1.5 flex-wrap px-4 pb-3 border-t border-[var(--border-subtle)] pt-3">
                {([['newest', 'Newest first'], ['oldest', 'Oldest first'], ['name-az', 'Name A→Z'], ['longest', 'Longest first'], ['shortest', 'Shortest first']] as [AnswerSortBy, string][]).map(([val, label]) => (
                  <button key={val} type="button"
                    onClick={() => { setAnswerSort(val); setUntaggedVisibleCount(15) }}
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
          {/* Answer selection bar */}
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
              {displayedAnswers.slice(0, untaggedVisibleCount).map((answer) => {
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
              {(untaggedVisibleCount < displayedAnswers.length || untaggedVisibleCount > 15) && (
                <div className="flex items-center justify-center gap-3 px-4 py-3">
                  {untaggedVisibleCount < displayedAnswers.length && (
                    <Button tone="secondary" size="sm" onClick={() => setUntaggedVisibleCount((n) => Math.min(n + 15, displayedAnswers.length))}>
                      Load {Math.min(15, displayedAnswers.length - untaggedVisibleCount)} more
                      <span className="ml-1 font-normal text-[var(--text-tertiary)]">({displayedAnswers.length - untaggedVisibleCount} remaining)</span>
                    </Button>
                  )}
                  {untaggedVisibleCount > 15 && <Button tone="ghost" size="sm" onClick={() => setUntaggedVisibleCount(15)}>Collapse</Button>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
    <DragOverlay>
      {activeTagId ? (() => {
        const tag = tagDefinitions.find((t) => t.id === activeTagId)
        const dragCount = activeDragIds.length
        return tag ? (
          <div className="relative pl-11">
            <span className="absolute left-0 top-1/2 flex h-8 w-7 -translate-y-1/2 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[var(--text-tertiary)] shadow-[var(--shadow-sm)]">
              <GripIcon />
            </span>
            <div className="flex min-w-72 items-center gap-3 rounded-xl border border-[var(--border-strong)] bg-white px-4 py-3 text-sm text-[var(--text)] opacity-95 shadow-[var(--shadow-lg)]">
              <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: tag.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{dragCount > 1 ? `${dragCount} selected tags` : tag.label}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{dragCount > 1 ? 'Move as a group' : 'Moving topic'}</p>
              </div>
            </div>
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
