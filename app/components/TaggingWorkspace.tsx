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
  expandedTagIds: Set<string>
  toggleTagExpand: (id: string) => void
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

      <button
        type="button"
        onClick={() => ctx.toggleTagExpand(tag.id)}
        className="shrink-0 flex items-center gap-1 text-sm tabular-nums text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
      >
        {count} {count === 1 ? 'answer' : 'answers'}
        <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${ctx.expandedTagIds.has(tag.id) ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 2l4 4-4 4" /></svg>
      </button>

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
  onRunBatch: () => void
  onClearBatchSummary: () => void
  onApply: (answerId: string, tagId: string) => void
  onCreateAndApply: (answerId: string, label: string) => void
  onRemove: (answerId: string, tagId: string) => void
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
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'idle' | 'confirm-delete' | 'grouping'>('idle')
  const [groupName, setGroupName] = useState('')
  const [namingSuggesting, setNamingSuggesting] = useState(false)
  const [expandedTagIds, setExpandedTagIds] = useState<Set<string>>(new Set())
  const [expandedThemeIds, setExpandedThemeIds] = useState<Set<string>>(new Set())
  const [ungroupedOpen, setUngroupedOpen] = useState(true)
  const [untaggedVisibleCount, setUntaggedVisibleCount] = useState(15)
  const [activeTagId, setActiveTagId] = useState<string | null>(null)

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ids of Object.values(tagIdsByAnswer)) {
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
  }, [tagIdsByAnswer])
  const themes = useMemo(() => tagDefinitions.filter((t) => t.parentId === null && tagDefinitions.some((c) => c.parentId === t.id)), [tagDefinitions])
  const ungroupedTags = useMemo(() => tagDefinitions.filter((t) => t.parentId === null && !tagDefinitions.some((c) => c.parentId === t.id)), [tagDefinitions])
  const untaggedAnswers = useMemo(() => answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).length === 0), [answers, tagIdsByAnswer])
  const leafTagsForApply = useMemo(() => tagDefinitions.filter((t) => t.parentId !== null || !tagDefinitions.some((c) => c.parentId === t.id)), [tagDefinitions])

  function toggleTagExpand(id: string) { setExpandedTagIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleThemeExpand(id: string) { setExpandedThemeIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleSelect(tagId: string) { setSelectedTagIds((p) => { const n = new Set(p); n.has(tagId) ? n.delete(tagId) : n.add(tagId); return n }) }
  function isGroupSelected(ids: string[]) { return ids.length > 0 && ids.every((id) => selectedTagIds.has(id)) }
  function isGroupIndeterminate(ids: string[]) { return ids.some((id) => selectedTagIds.has(id)) && !ids.every((id) => selectedTagIds.has(id)) }
  function toggleGroupSelect(ids: string[]) {
    if (isGroupSelected(ids)) setSelectedTagIds((p) => { const n = new Set(p); ids.forEach((id) => n.delete(id)); return n })
    else setSelectedTagIds((p) => { const n = new Set(p); ids.forEach((id) => n.add(id)); return n })
  }
  function clearSelection() { setSelectedTagIds(new Set()); setBulkAction('idle'); setGroupName('') }

  async function handleBulkDelete() {
    for (const id of Array.from(selectedTagIds)) await onDelete(id, tagDefinitions.some((c) => c.parentId === id) ? 'keep-subtags' : undefined)
    clearSelection()
  }
  async function handleGroupSelected() {
    const label = normalizeLabel(groupName); if (!label) return
    const result = await createQuestionTag(studyId, questionId, label, DEFAULT_COLORS[tagDefinitions.length % DEFAULT_COLORS.length])
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
  async function handleBulkMoveToTheme(themeId: string) {
    for (const tagId of Array.from(selectedTagIds)) await onMoveToTheme(tagId, themeId)
    clearSelection()
  }
  async function handleBulkAiGroup() {
    const sel = tagDefinitions.filter((t) => selectedTagIds.has(t.id)); if (sel.length < 2) return
    setConsolidating(true); setAiError(null); setAiProposal(null)
    const result = await consolidateTagsWithAI(studyId, questionId, sel.map((t) => ({ id: t.id, label: t.label })))
    setConsolidating(false)
    if ('error' in result && result.error) { setAiError(result.error as string); return }
    if (result.themes.length === 0) { setAiError('AI returned no theme groupings.'); return }
    setAiProposalScope(new Set(sel.map((t) => t.id)))
    setAiProposal(result.themes.map((theme, i) => ({ tempId: `temp-${i}-${Date.now()}`, name: theme.name, description: theme.description, tagIds: theme.tagIds })))
    clearSelection()
  }
  async function handleCreate() {
    const label = normalizeLabel(newLabel); if (!label) return
    await onCreate(label, newColor)
    setNewLabel(''); setNewColor(DEFAULT_COLORS[tagDefinitions.length % DEFAULT_COLORS.length])
  }
  async function handleAiConsolidate() {
    const leafTags = tagDefinitions.filter((t) => t.parentId === null && !tagDefinitions.some((c) => c.parentId === t.id))
    if (leafTags.length < 2) return
    setConsolidating(true); setAiError(null); setAiProposal(null)
    const result = await consolidateTagsWithAI(studyId, questionId, leafTags.map((t) => ({ id: t.id, label: t.label })))
    setConsolidating(false)
    if ('error' in result && result.error) { setAiError(result.error as string); return }
    if (result.themes.length === 0) { setAiError('AI returned no theme groupings.'); return }
    setAiProposalScope(new Set(leafTags.map((t) => t.id)))
    setAiProposal(result.themes.map((theme, i) => ({ tempId: `temp-${i}-${Date.now()}`, name: theme.name, description: theme.description, tagIds: theme.tagIds })))
  }
  async function applyProposal(proposals: ProposedTheme[]) {
    for (const theme of proposals) {
      if (!theme.tagIds.length) continue
      const result = await createQuestionTag(studyId, questionId, normalizeLabel(theme.name) || 'Theme', DEFAULT_COLORS[proposals.indexOf(theme) % DEFAULT_COLORS.length])
      if (!result?.tag) continue
      for (const tagId of theme.tagIds) await onMoveToTheme(tagId, result.tag.id)
      if (theme.description) await onUpdateDescription(result.tag.id, theme.description)
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
  function handleDragEnd(event: DragEndEvent) {
    setActiveTagId(null)
    const { active, over } = event; if (!over) return
    const tagId = String(active.id).replace(/^tag-/, '')
    const dest = String(over.id)
    if (dest === 'ungrouped') void onMoveToTheme(tagId, null)
    else if (dest.startsWith('theme-')) void onMoveToTheme(tagId, dest.replace(/^theme-/, ''))
  }

  const ctxValue: ManageCtxType = {
    selectedTagIds, toggleSelect,
    savingTagId, tagCounts, tagDefinitions,
    renamingId, renameValue, setRenameValue, setRenamingId, commitRename,
    editingDescId, descValue, setDescValue, setEditingDescId, commitDesc,
    confirmDeleteId, setConfirmDeleteId, onDelete, onRename,
    startRename, startEditDesc,
    expandedTagIds, toggleTagExpand,
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

  const Chevron = ({ open }: { open: boolean }) => (
    <svg viewBox="0 0 12 12" className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 2l4 4-4 4" /></svg>
  )

  return (
    <ManageCtx.Provider value={ctxValue}>
    <DndContext onDragStart={(e) => setActiveTagId(String(e.active.id).replace(/^tag-/, ''))} onDragEnd={handleDragEnd}>
    <div className="space-y-4">

      {/* Header: new tag + AI group */}
      <div className="flex gap-2 flex-wrap items-center">
        <TextInput value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreate() } }} placeholder="New tag name" className="h-9 py-0 flex-1 min-w-40" />
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} aria-label="Tag color" className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-[var(--border-strong)] bg-white p-1" />
        <Button tone="primary" size="sm" onClick={() => void handleCreate()} disabled={!newLabel.trim() || savingTagId === 'new'} className="shrink-0 whitespace-nowrap">{savingTagId === 'new' ? 'Adding…' : 'Add tag'}</Button>
        <div className="flex-1" />
        <Button tone="secondary" size="sm" onClick={() => void handleAiConsolidate()} disabled={consolidating || ungroupedTags.length < 2} className="shrink-0 whitespace-nowrap">{consolidating ? '✦ Grouping…' : '✦ Group with AI'}</Button>
      </div>

      {/* Selection bar */}
      {selectedTagIds.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap rounded-xl border border-[var(--accent-muted)] bg-[var(--accent-subtle)] px-4 py-2.5">
          <span className="text-sm font-semibold text-[var(--text)]">{selectedTagIds.size} selected</span>
          <span className="text-[var(--text-tertiary)]">·</span>
          {bulkAction === 'idle' && (
            <>
              <Button tone="danger" size="sm" onClick={() => setBulkAction('confirm-delete')}>Delete</Button>
              {themes.length > 0 && <SelectMenu value="" options={[{ value: '', label: 'Move to theme…' }, ...themes.map((t) => ({ value: t.id, label: t.label }))]} onChange={(v) => { if (v) void handleBulkMoveToTheme(v) }} buttonClassName="h-8 text-sm" />}
              <Button tone="secondary" size="sm" onClick={() => setBulkAction('grouping')}>Group into theme</Button>
              <Button tone="secondary" size="sm" onClick={() => void handleBulkAiGroup()} disabled={consolidating || selectedTagIds.size < 2}>{consolidating ? '✦ Grouping…' : '✦ Group with AI'}</Button>
            </>
          )}
          {bulkAction === 'confirm-delete' && (
            <>
              <span className="text-sm text-[var(--danger-text)]">Delete {selectedTagIds.size} tag{selectedTagIds.size !== 1 ? 's' : ''}?{Array.from(selectedTagIds).some((id) => tagDefinitions.some((c) => c.parentId === id)) && ' Themes will be removed; sub-tags ungrouped.'}</span>
              <Button tone="danger" size="sm" onClick={() => void handleBulkDelete()}>Confirm</Button>
              <Button tone="secondary" size="sm" onClick={() => setBulkAction('idle')}>Cancel</Button>
            </>
          )}
          {bulkAction === 'grouping' && (
            <>
              <TextInput value={groupName} onChange={(e) => setGroupName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleGroupSelected() } }} placeholder="Theme name…" className="h-8 py-0 w-44" />
              <Button tone="secondary" size="sm" onClick={() => void handleSuggestGroupName()} disabled={namingSuggesting}>{namingSuggesting ? '…' : '✦ AI name'}</Button>
              <Button tone="primary" size="sm" onClick={() => void handleGroupSelected()} disabled={!groupName.trim()}>Create theme</Button>
              <Button tone="secondary" size="sm" onClick={() => setBulkAction('idle')}>Cancel</Button>
            </>
          )}
          <div className="flex-1" />
          <button type="button" onClick={clearSelection} aria-label="Clear selection" className="rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text)]">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
      )}

      {/* AI error */}
      {aiError && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', border: '1px solid var(--danger-border)' }}>AI error: {aiError}</p>}

      {/* AI proposal */}
      {aiProposal && (
        <AIProposalPanel
          proposal={aiProposal}
          tagById={new Map(tagDefinitions.map((t) => [t.id, t]))}
          allTagIds={aiProposalScope}
          studyId={studyId} questionId={questionId}
          tagDefinitions={tagDefinitions}
          answers={answers} tagIdsByAnswer={tagIdsByAnswer}
          onApply={applyProposal}
          onCancel={() => setAiProposal(null)}
        />
      )}

      {/* Tag structure */}
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        {tagDefinitions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--text-tertiary)]">No tags yet. Add one above or use AI to tag answers below.</p>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">

            {/* Themes */}
            {themes.map((theme) => {
              const children = tagDefinitions.filter((t) => t.parentId === theme.id)
              const isOpen = expandedThemeIds.has(theme.id)
              const themeCount = children.reduce((s, c) => s + (tagCounts.get(c.id) ?? 0), 0)
              return (
                <div key={theme.id}>
                  <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-sunken)]">
                    <button type="button" onClick={() => toggleThemeExpand(theme.id)} className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text)]"><Chevron open={isOpen} /></button>
                    <input type="checkbox" checked={isGroupSelected(children.map((c) => c.id))} ref={(el) => { if (el) el.indeterminate = isGroupIndeterminate(children.map((c) => c.id)) }} onChange={() => toggleGroupSelect(children.map((c) => c.id))} aria-label={`Select all tags in ${theme.label}`} className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]" />
                    <span className="text-base">📂</span>
                    <input type="color" value={theme.color} onChange={(e) => onRename(theme.id, theme.label, e.target.value)} aria-label={`${theme.label} color`} className="h-7 w-8 cursor-pointer rounded border border-[var(--border)] bg-white p-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      {renamingId === theme.id ? (
                        <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => void commitRename(theme)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commitRename(theme) } if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') } }} className="w-full rounded-lg border border-[var(--border-focus)] bg-white px-2 py-0.5 text-sm font-bold text-[var(--text)] outline-none ring-2 ring-[var(--accent-ring)]" />
                      ) : (
                        <button type="button" onClick={() => startRename(theme)} title="Click to rename" className="block text-left text-sm font-bold text-[var(--text)] hover:text-[var(--text-link)]">{theme.label}</button>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-[var(--text-tertiary)] whitespace-nowrap">{children.length} tag{children.length !== 1 ? 's' : ''} · {themeCount} answer{themeCount !== 1 ? 's' : ''}</span>
                    {confirmDeleteId === theme.id ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button tone="secondary" size="sm" onClick={() => { void onDelete(theme.id, 'keep-subtags'); setConfirmDeleteId(null) }} className="text-xs whitespace-nowrap">Remove theme, keep tags</Button>
                        <Button tone="danger" size="sm" onClick={() => { void onDelete(theme.id, 'delete-all'); setConfirmDeleteId(null) }} className="text-xs whitespace-nowrap">Delete all</Button>
                        <Button tone="secondary" size="sm" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <IconButton tone="trash" label={`Delete theme ${theme.label}`} onClick={() => setConfirmDeleteId(theme.id)} className="h-8 w-8 shrink-0"><TrashIcon /></IconButton>
                    )}
                  </div>
                  {isOpen && (
                    <ThemeDropZone themeId={theme.id}>
                      {children.map((tag) => (
                        <div key={tag.id}>
                          <TagRow tag={tag} isIndented />
                          {expandedTagIds.has(tag.id) && <TagAnswers tag={tag} indent />}
                        </div>
                      ))}
                    </ThemeDropZone>
                  )}
                </div>
              )
            })}

            {/* Ungrouped */}
            {ungroupedTags.length > 0 && (
              <div>
                <div className="flex items-center gap-3 px-4 py-2 bg-[var(--bg-sunken)]">
                  <button type="button" onClick={() => setUngroupedOpen((o) => !o)} className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text)]"><Chevron open={ungroupedOpen} /></button>
                  <input type="checkbox" checked={isGroupSelected(ungroupedTags.map((t) => t.id))} ref={(el) => { if (el) el.indeterminate = isGroupIndeterminate(ungroupedTags.map((t) => t.id)) }} onChange={() => toggleGroupSelect(ungroupedTags.map((t) => t.id))} aria-label="Select all ungrouped tags" className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Ungrouped — {ungroupedTags.length} tag{ungroupedTags.length !== 1 ? 's' : ''}</span>
                </div>
                {ungroupedOpen && (
                  <UngroupedDropZone>
                    {ungroupedTags.map((tag) => (
                      <div key={tag.id}>
                        <TagRow tag={tag} />
                        {expandedTagIds.has(tag.id) && <TagAnswers tag={tag} indent={false} />}
                      </div>
                    ))}
                  </UngroupedDropZone>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Untagged answers */}
      {untaggedAnswers.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
            <span className="text-sm font-semibold text-[var(--text)]">{untaggedAnswers.length} untagged answer{untaggedAnswers.length !== 1 ? 's' : ''}</span>
            <div className="flex-1" />
            {!batchRunning && (
              <>
                <SelectMenu value={batchMode} options={[{ value: 'explore', label: 'Explore — create new tags' }, { value: 'apply', label: 'Apply — use existing tags' }]} onChange={(v) => setBatchMode(v as 'apply' | 'explore')} buttonClassName="h-8 text-sm" />
                {batchSummary ? (
                  <Button tone="secondary" size="sm" onClick={onClearBatchSummary}>Tag again</Button>
                ) : (
                  <Button tone="primary" size="sm" onClick={onRunBatch} disabled={batchMode === 'apply' && tagDefinitions.length === 0} className="whitespace-nowrap">✦ AI tag all</Button>
                )}
              </>
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
                ? <p className="text-sm font-semibold" style={{ color: 'var(--success-text)' }}>Done — {batchSummary.tagsApplied} tags applied across {batchSummary.total} answers</p>
                : <p className="text-sm text-[var(--text-secondary)]">Processed {batchSummary.total} answers but found nothing new to tag.{batchMode === 'apply' && tagDefinitions.length === 0 && ' No existing tags — try Explore mode.'}</p>
              }
            </div>
          )}
          {!batchRunning && (
            <div className="divide-y divide-[var(--border-subtle)]">
              {untaggedAnswers.slice(0, untaggedVisibleCount).map((answer) => {
                const currentTagIds = tagIdsByAnswer[answer.answerId] ?? []
                const currentTags = currentTagIds.map((id) => tagById.get(id)).filter(Boolean) as TagDefinition[]
                const available = leafTagsForApply.filter((t) => !currentTagIds.includes(t.id))
                const isSaving = savingAnswerId === answer.answerId
                return (
                  <article key={answer.answerId} className="space-y-2.5 px-4 py-4">
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
                      {available.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {available.map((tag) => (
                            <button key={tag.id} type="button" onClick={() => onApply(answer.answerId, tag.id)} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white px-2.5 py-0.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-muted)] hover:bg-[var(--accent-subtle)] hover:text-[var(--text-link)]">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />+ {tag.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <TagAutocomplete tags={tagDefinitions} appliedTagIds={currentTagIds} onApply={(id) => onApply(answer.answerId, id)} onCreate={(label) => onCreateAndApply(answer.answerId, label)} disabled={isSaving || savingTagId === 'new'} />
                    </div>
                  </article>
                )
              })}
              {(untaggedVisibleCount < untaggedAnswers.length || untaggedVisibleCount > 15) && (
                <div className="flex items-center justify-center gap-3 px-4 py-3">
                  {untaggedVisibleCount < untaggedAnswers.length && <Button tone="secondary" size="sm" onClick={() => setUntaggedVisibleCount((n) => Math.min(n + 15, untaggedAnswers.length))}>Load more</Button>}
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
        return tag ? (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-white px-4 py-3 shadow-lg text-sm font-semibold text-[var(--text)] opacity-90">
            <span className="h-3 w-3 rounded-full shrink-0" style={{ background: tag.color }} />{tag.label}
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

    const toProcess = answers.filter((a) => (tagIdsByAnswer[a.answerId] ?? []).length === 0)

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
      onRunBatch={() => void runBatchTag()}
      onClearBatchSummary={() => setBatchSummary(null)}
      onApply={applyTag}
      onCreateAndApply={createAndApplyTag}
      onRemove={removeTag}
      onRename={renameTag}
      onDelete={deleteTag}
      onCreate={createTag}
      onMoveToTheme={moveTagToTheme}
      onUpdateDescription={updateDescription}
    />
  )
}
