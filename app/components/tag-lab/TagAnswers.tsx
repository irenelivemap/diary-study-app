/**
 * Main tag lab interface for tagging answers, managing tags, themes, and AI proposals.
 */
import type { Answer, TagDefinition } from './types'
import { formatDate } from './utils'

export default function TagAnswers({
  tag,
  indent,
  answers,
  tagIdsByAnswer,
  onRemove,
}: {
  tag: TagDefinition
  indent: boolean
  answers: Answer[]
  tagIdsByAnswer: Record<string, string[]>
  onRemove: (answerId: string, tagId: string) => void
}) {
  const tagged = answers.filter((answer) => (tagIdsByAnswer[answer.answerId] ?? []).includes(tag.id))
  const pl = indent ? 'pl-14' : 'pl-6'
  if (!tagged.length) return <p className={`${pl} pr-4 py-3 text-sm italic text-[var(--text-tertiary)] bg-[var(--bg-sunken)]`}>No answers tagged yet.</p>
  return (
    <div className="divide-y divide-[var(--border-subtle)] bg-[var(--bg-sunken)]">
      {tagged.map((answer) => (
        <div key={answer.answerId} className={`flex items-start gap-3 ${pl} pr-4 py-3`}>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
              <span className="font-medium text-[var(--text-secondary)]">{answer.participantName}</span>
              <span>{formatDate(answer.submittedAt)}</span>
            </div>
            <p className="text-sm leading-relaxed text-[var(--text)] line-clamp-3">{answer.answer}</p>
          </div>
          <button type="button" onClick={() => onRemove(answer.answerId, tag.id)} title="Remove tag from answer" className="mt-1 shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--danger-text)]">
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
      ))}
    </div>
  )
}
