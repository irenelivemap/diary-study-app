import type { ReactNode } from 'react'
import { Button, IconButton, TrashIcon } from '@/app/components/ui'

export function TagSectionHeader({
  itemCount,
  checked,
  indeterminate,
  emptyLabel,
  allLabel,
  checkboxLabel,
  selectedCount,
  deleteLabel,
  indentClassName,
  onToggleAll,
  onDeleteSelected,
  rightAction,
}: {
  itemCount: number
  checked: boolean
  indeterminate: boolean
  emptyLabel: string
  allLabel: string
  checkboxLabel: string
  selectedCount: number
  deleteLabel: string
  indentClassName: string
  onToggleAll: () => void
  onDeleteSelected: () => void
  rightAction?: ReactNode
}) {
  return (
    <div className={`flex items-center gap-2 py-1 pr-1 ${itemCount > 0 ? indentClassName : 'pl-1'}`}>
      {itemCount > 0 ? (
        <>
          <input
            type="checkbox"
            checked={checked}
            ref={(el) => { if (el) el.indeterminate = indeterminate }}
            onChange={onToggleAll}
            aria-label={checkboxLabel}
            className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
          />
          <span className="text-sm font-semibold text-[var(--text)]">{allLabel}</span>
        </>
      ) : (
        <span className="text-sm font-semibold text-[var(--text)]">{emptyLabel}</span>
      )}
      {itemCount > 0 && (
        <div className="h-8 w-8 shrink-0">
          {selectedCount > 0 && (
            <IconButton
              type="button"
              onClick={onDeleteSelected}
              label={deleteLabel}
              tone="trash"
              className="h-8 w-8 rounded-lg"
            >
              <TrashIcon />
            </IconButton>
          )}
        </div>
      )}
      <div className="flex-1" />
      {rightAction}
    </div>
  )
}

export function BulkDeleteConfirm({
  count,
  noun,
  detail,
  onConfirm,
  onCancel,
}: {
  count: number
  noun: string
  detail?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (count === 0) return null
  return (
    <div className="flex items-center justify-end gap-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2">
      <span className="text-sm text-[var(--danger-text)]">
        Delete {count} selected {noun}{count !== 1 ? 's' : ''}?{detail ? ` ${detail}` : ''}
      </span>
      <Button tone="danger" size="sm" onClick={onConfirm}>Confirm</Button>
      <Button tone="secondary" size="sm" onClick={onCancel}>Cancel</Button>
    </div>
  )
}
