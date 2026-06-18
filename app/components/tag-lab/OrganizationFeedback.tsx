import { Button, TextInput } from '@/app/components/ui'
import type { SaveNotice } from './types'

export function SelectedTagsGroupingBar({
  value,
  suggesting,
  onValueChange,
  onSuggestName,
  onCreateTheme,
  onCancel,
}: {
  value: string
  suggesting: boolean
  onValueChange: (value: string) => void
  onSuggestName: () => void
  onCreateTheme: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2">
      <TextInput
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCreateTheme() } }}
        placeholder="Theme name…"
        className="h-8 py-0 w-44 bg-white"
      />
      <Button tone="secondary" size="sm" onClick={onSuggestName} disabled={suggesting}>{suggesting ? '…' : '✦ AI name'}</Button>
      <Button tone="primary" size="sm" onClick={onCreateTheme} disabled={!value.trim()}>Create theme</Button>
      <Button tone="secondary" size="sm" onClick={onCancel}>Cancel</Button>
    </div>
  )
}

export function AiErrorMessage({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', border: '1px solid var(--danger-border)' }}>
      AI error: {message}
    </p>
  )
}

export function SaveNoticeMessage({ notice }: { notice: SaveNotice }) {
  if (!notice) return null
  return (
    <p
      role="status"
      className="rounded-lg border px-3 py-2 text-sm"
      style={{
        background: notice.tone === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
        color: notice.tone === 'error' ? 'var(--danger-text)' : 'var(--success-text)',
        borderColor: notice.tone === 'error' ? 'var(--danger-border)' : 'var(--success-border)',
      }}
    >
      {notice.message}
    </p>
  )
}
