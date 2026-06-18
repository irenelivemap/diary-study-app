'use client'

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { InsertionIndicator, TagDefinition } from './types'

export type ManageCtxType = {
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

export const ManageCtx = createContext<ManageCtxType | null>(null)

function useManageCtx() {
  const ctx = useContext(ManageCtx)
  if (!ctx) throw new Error('useManageCtx used outside ManageCtx.Provider')
  return ctx
}

export function GripIcon() {
  return (
    <svg viewBox="0 0 10 16" className="h-4 w-2.5" fill="currentColor" aria-hidden>
      <circle cx="2" cy="3" r="1.5" /><circle cx="8" cy="3" r="1.5" />
      <circle cx="2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" />
      <circle cx="2" cy="13" r="1.5" /><circle cx="8" cy="13" r="1.5" />
    </svg>
  )
}

export function ThemeDropZone({ themeId, themeLabel, active, children }: { themeId: string; themeLabel: string; active: boolean; children: ReactNode }) {
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

export function ThemeChildren({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-b-xl bg-[var(--bg-sunken)] px-4 py-1">
      {children}
    </div>
  )
}

export function UngroupedDropZone({ children }: { children: ReactNode }) {
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

export function TagRow({ tag, isIndented }: { tag: TagDefinition; isIndented?: boolean }) {
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

        <input
          type="checkbox"
          checked={ctx.selectedTagIds.has(tag.id)}
          onChange={() => ctx.toggleSelect(tag.id)}
          aria-label={`Select ${tag.label}`}
          className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
        />

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
