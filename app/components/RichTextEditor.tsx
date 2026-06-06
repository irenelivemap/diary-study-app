'use client'
import { useRef, useEffect } from 'react'

type Props = {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  singleLine?: boolean
  compact?: boolean
  className?: string
}

const FONT_SIZES = [
  { label: 'S', value: '1', title: 'Small' },
  { label: 'M', value: '3', title: 'Normal' },
  { label: 'L', value: '5', title: 'Large' },
  { label: 'XL', value: '6', title: 'Extra large' },
]

const PRESET_COLORS = [
  '#1e293b', // slate-800 (default)
  '#dc2626', // red
  '#ea580c', // orange
  '#ca8a04', // yellow
  '#16a34a', // green
  '#2563eb', // blue
  '#7c3aed', // purple
  '#db2777', // pink
]

export default function RichTextEditor({ value, onChange, placeholder, singleLine, compact, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const isComposing = useRef(false)

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value
    }
  }, [value])

  function exec(cmd: string, arg?: string) {
    ref.current?.focus()
    // styleWithCSS ensures font size and color produce inline styles
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(cmd, false, arg)
    if (ref.current) onChange(ref.current.innerHTML)
  }

  function handleInput() {
    if (!isComposing.current && ref.current) {
      onChange(ref.current.innerHTML)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (singleLine && e.key === 'Enter') e.preventDefault()
  }

  return (
    <div className={`group ${compact ? 'relative' : ''}`}>
      <div className={compact
        ? 'absolute bottom-full left-0 z-20 mb-2 hidden max-w-full flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg group-focus-within:flex'
        : 'flex items-center gap-1 mb-1.5 flex-wrap opacity-0 group-focus-within:opacity-100 transition-opacity'
      }>
        {/* Bold / Italic / Underline */}
        {[
          { cmd: 'bold', label: <strong className="text-xs">B</strong>, title: 'Bold' },
          { cmd: 'italic', label: <em className="text-xs">I</em>, title: 'Italic' },
          { cmd: 'underline', label: <span className="text-xs underline">U</span>, title: 'Underline' },
        ].map(({ cmd, label, title }) => (
          <button
            key={cmd}
            type="button"
            title={title}
            onMouseDown={(e) => { e.preventDefault(); exec(cmd) }}
            className="w-7 h-7 flex items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 bg-white"
          >
            {label}
          </button>
        ))}

        <div className="w-px h-5 bg-slate-200 mx-0.5" />

        {/* Font sizes */}
        {FONT_SIZES.map(({ label, value, title }) => (
          <button
            key={value}
            type="button"
            title={title}
            onMouseDown={(e) => { e.preventDefault(); exec('fontSize', value) }}
            className="h-7 px-1.5 flex items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 bg-white text-xs font-medium"
          >
            {label}
          </button>
        ))}

        <div className="w-px h-5 bg-slate-200 mx-0.5" />

        {/* Color presets */}
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onMouseDown={(e) => { e.preventDefault(); exec('foreColor', color) }}
            className="w-5 h-5 rounded-full border-2 border-white ring-1 ring-slate-300 hover:ring-slate-500 transition-shadow"
            style={{ backgroundColor: color }}
          />
        ))}

        {/* Custom color picker */}
        <label title="Custom color" className="w-7 h-7 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer overflow-hidden relative">
          <span className="text-xs">🎨</span>
          <input
            type="color"
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            onInput={(e) => {
              ref.current?.focus()
              exec('foreColor', (e.target as HTMLInputElement).value)
            }}
          />
        </label>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => { isComposing.current = true }}
        onCompositionEnd={() => {
          isComposing.current = false
          if (ref.current) onChange(ref.current.innerHTML)
        }}
        data-placeholder={placeholder}
        className={`outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 ${singleLine ? 'min-h-[1.5rem]' : compact ? 'min-h-[1.75rem]' : 'min-h-[4rem]'} ${className ?? ''}`}
      />
    </div>
  )
}
