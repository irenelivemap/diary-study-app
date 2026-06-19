/**
 * Tag chip shown on answers after a tag has been applied.
 */
import type { TagDefinition } from './types'
import { readableTextColor } from './utils'

export default function AppliedTagChip({
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
        <span className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
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
