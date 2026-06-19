'use client'
/**
 * Autocomplete input for applying existing tags or creating new ones on an answer.
 */

import { useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { TagDefinition } from './types'
import { isThemeTag, normalizeLabel } from './utils'

export default function TagAutocomplete({
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

  const leafTags = useMemo(() => tags.filter((tag) => !isThemeTag(tag)), [tags])

  const suggestions = useMemo(() => {
    if (!value.trim()) return []
    const q = value.toLowerCase()
    return leafTags.filter((tag) => !appliedTagIds.includes(tag.id) && tag.label.toLowerCase().includes(q))
  }, [value, leafTags, appliedTagIds])

  function commit(tag: TagDefinition | null, raw: string) {
    if (tag) {
      onApply(tag.id)
    } else {
      const label = normalizeLabel(raw)
      if (!label) return
      const exact = leafTags.find((candidate) => candidate.label.toLowerCase() === label.toLowerCase())
      if (exact) onApply(exact.id)
      else onCreate(label)
    }
    setValue('')
    setOpen(false)
    setCursor(-1)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
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

  const exactMatch = value.trim() && leafTags.some((tag) => tag.label.toLowerCase() === value.trim().toLowerCase())

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
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-48 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-lg">
          {suggestions.slice(0, 8).map((tag, i) => {
            const parent = tag.parentId ? tags.find((candidate) => candidate.id === tag.parentId) : null
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
                  {parent && <span className="mr-1 text-[var(--text-tertiary)]">{parent.label} &rsaquo; </span>}
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
