/**
 * Inline row for creating a new tag manually.
 */
import { Button, TextInput } from '@/app/components/ui'

export default function TagCreateRow({
  value,
  color,
  placeholder,
  colorLabel,
  buttonLabel,
  busyLabel,
  busy,
  onValueChange,
  onColorChange,
  onCreate,
}: {
  value: string
  color: string
  placeholder: string
  colorLabel: string
  buttonLabel: string
  busyLabel: string
  busy: boolean
  onValueChange: (value: string) => void
  onColorChange: (color: string) => void
  onCreate: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <TextInput
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCreate() } }}
          placeholder={placeholder}
          className="h-9 flex-1 py-0 min-w-40"
        />
        <label className="relative h-5 w-5 shrink-0 cursor-pointer" title={colorLabel}>
          <span className="block h-5 w-5 rounded-full ring-2 ring-[var(--border-strong)]" style={{ backgroundColor: color }} />
          <input type="color" value={color} onChange={(e) => onColorChange(e.target.value)} aria-label={colorLabel} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
        <Button tone="primary" size="sm" onClick={onCreate} disabled={!value.trim() || busy} className="shrink-0 whitespace-nowrap">
          {busy ? busyLabel : buttonLabel}
        </Button>
      </div>
    </div>
  )
}
