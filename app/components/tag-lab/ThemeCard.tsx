'use client'
/**
 * Theme container used to display and manage grouped tags.
 */

import type { Answer, TagDefinition } from './types'
import { sortTags } from './utils'
import { TagRow, ThemeChildren, ThemeDropZone } from './ManageTagRows'
import TagAnswers from './TagAnswers'

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 2l4 4-4 4" />
    </svg>
  )
}

export default function ThemeCard({
  theme,
  tagDefinitions,
  answers,
  tagIdsByAnswer,
  selected,
  expanded,
  dropActive,
  renaming,
  renameValue,
  editingDescription,
  descriptionValue,
  expandedTagIds,
  onToggleExpand,
  onToggleSelect,
  onRenameColor,
  onStartRename,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onStartEditDescription,
  onDescriptionValueChange,
  onCommitDescription,
  onCancelDescription,
  onRemoveAnswerTag,
}: {
  theme: TagDefinition
  tagDefinitions: TagDefinition[]
  answers: Answer[]
  tagIdsByAnswer: Record<string, string[]>
  selected: boolean
  expanded: boolean
  dropActive: boolean
  renaming: boolean
  renameValue: string
  editingDescription: boolean
  descriptionValue: string
  expandedTagIds: Set<string>
  onToggleExpand: () => void
  onToggleSelect: () => void
  onRenameColor: (color: string) => void
  onStartRename: () => void
  onRenameValueChange: (value: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onStartEditDescription: () => void
  onDescriptionValueChange: (value: string) => void
  onCommitDescription: () => void
  onCancelDescription: () => void
  onRemoveAnswerTag: (answerId: string, tagId: string) => void
}) {
  const children = sortTags(tagDefinitions.filter((tag) => tag.parentId === theme.id))

  return (
    <ThemeDropZone themeId={theme.id} themeLabel={theme.label} active={dropActive}>
      <div
        className={`group/theme flex items-start gap-3 border-l-4 bg-white px-4 py-3.5 cursor-pointer select-none transition-colors hover:bg-[var(--bg-sunken)]/45 ${expanded ? 'rounded-t-xl border-b border-[var(--border-subtle)]' : 'rounded-xl'}`}
        style={{ borderLeftColor: theme.color }}
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpand() } }}
        aria-expanded={expanded}
      >
        <span className="shrink-0 mt-1 flex h-5 w-5 items-center justify-center text-[var(--text-tertiary)]">
          <ChevronIcon open={expanded} />
        </span>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${theme.label}`}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
        />
        <label className="relative mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer" title="Change theme color" onClick={(e) => e.stopPropagation()}>
          <span className="block h-[18px] w-[18px] rounded-md ring-1 ring-black/10" style={{ backgroundColor: theme.color }} />
          <input type="color" value={theme.color} onChange={(e) => onRenameColor(e.target.value)} aria-label={`${theme.label} color`} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
        </label>
        <div className="flex-1 min-w-0 space-y-1" onClick={(e) => e.stopPropagation()}>
          {renaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); onCommitRename() }
                if (e.key === 'Escape') onCancelRename()
              }}
              className="w-full rounded-lg border border-[var(--border-focus)] bg-white px-2 py-0.5 text-sm font-bold text-[var(--text)] outline-none ring-2 ring-[var(--accent-ring)]"
            />
          ) : (
            <button type="button" onClick={onStartRename} className="group/name flex w-fit max-w-full items-center gap-1 text-left text-[15px] font-bold leading-snug text-[var(--text)] hover:text-[var(--text-link)]">
              {theme.label}
              <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 opacity-0 group-hover/name:opacity-50 transition-opacity" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" /></svg>
            </button>
          )}
          {expanded && (
            editingDescription ? (
              <textarea
                autoFocus
                value={descriptionValue}
                onChange={(e) => onDescriptionValueChange(e.target.value)}
                onBlur={onCommitDescription}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommitDescription() }
                  if (e.key === 'Escape') onCancelDescription()
                }}
                rows={2}
                placeholder="Add description…"
                className="w-full rounded-lg border border-[var(--border-focus)] bg-white px-2 py-1.5 text-sm text-[var(--text-secondary)] outline-none ring-2 ring-[var(--accent-ring)]"
              />
            ) : (
              <button
                type="button"
                onClick={onStartEditDescription}
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
      {expanded && (
        <ThemeChildren>
          {children.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-white px-4 py-3 text-sm text-[var(--text-tertiary)]">
              Drag tags here.
            </p>
          ) : (
            children.map((tag) => (
              <div key={tag.id}>
                <TagRow tag={tag} isIndented />
                {expandedTagIds.has(tag.id) && <TagAnswers tag={tag} indent answers={answers} tagIdsByAnswer={tagIdsByAnswer} onRemove={onRemoveAnswerTag} />}
              </div>
            ))
          )}
        </ThemeChildren>
      )}
    </ThemeDropZone>
  )
}
