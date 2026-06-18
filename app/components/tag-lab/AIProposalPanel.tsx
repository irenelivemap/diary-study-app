'use client'

import { useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { suggestThemeName } from '@/app/actions/analysis'
import SelectMenu from '@/app/components/SelectMenu'
import { Button } from '@/app/components/ui'
import type { Answer, ProposedTheme, TagDefinition } from './types'

export default function AIProposalPanel({
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

  const assignedTagIds = useMemo(() => new Set(themes.flatMap((theme) => theme.tagIds)), [themes])
  const unassignedTagIds = useMemo(() => [...allTagIds].filter((id) => !assignedTagIds.has(id)), [allTagIds, assignedTagIds])

  function removeSubTag(themeId: string, tagId: string) {
    setThemes((prev) => prev.map((theme) => theme.tempId === themeId ? { ...theme, tagIds: theme.tagIds.filter((id) => id !== tagId) } : theme))
  }

  function removeTheme(themeId: string) {
    setThemes((prev) => prev.filter((theme) => theme.tempId !== themeId))
  }

  function renameTheme(themeId: string, name: string) {
    setThemes((prev) => prev.map((theme) => theme.tempId === themeId ? { ...theme, name } : theme))
  }

  function updateDesc(themeId: string, description: string) {
    setThemes((prev) => prev.map((theme) => theme.tempId === themeId ? { ...theme, description } : theme))
  }

  function addTagToTheme(themeId: string, tagId: string) {
    setThemes((prev) => prev.map((theme) => theme.tempId === themeId ? { ...theme, tagIds: [...theme.tagIds, tagId] } : theme))
  }

  async function handleSuggestName(theme: ProposedTheme) {
    setSuggestingId(theme.tempId)
    const labels = theme.tagIds.map((id) => tagById.get(id)?.label ?? '').filter(Boolean)
    const result = await suggestThemeName(labels)
    setSuggestingId(null)
    if ('name' in result && result.name) {
      setThemes((prev) => prev.map((candidate) => candidate.tempId === theme.tempId ? {
        ...candidate,
        name: result.name,
        description: result.description ?? candidate.description,
      } : candidate))
    }
  }

  async function handleApply() {
    setApplying(true)
    await onApply(themes.filter((theme) => theme.tagIds.length > 0))
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

              {themesRelatedAnswers(theme, answers, tagIdsByAnswer, expandedComments, setExpandedComments)}

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
          disabled={applying || themes.filter((theme) => theme.tagIds.length > 0).length === 0}
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

function themesRelatedAnswers(
  theme: ProposedTheme,
  answers: Answer[],
  tagIdsByAnswer: Record<string, string[]>,
  expandedComments: Set<string>,
  setExpandedComments: Dispatch<SetStateAction<Set<string>>>
) {
  const themeTagSet = new Set(theme.tagIds)
  const related = answers.filter((answer) =>
    (tagIdsByAnswer[answer.answerId] ?? []).some((tagId) => themeTagSet.has(tagId))
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
          {related.map((answer) => (
            <div key={answer.answerId} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">{answer.participantName}</span>
                <span className="text-xs text-[var(--text-tertiary)]">{new Date(answer.submittedAt).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-[var(--text)] line-clamp-3">{answer.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
