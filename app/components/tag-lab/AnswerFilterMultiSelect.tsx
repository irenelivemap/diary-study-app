'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { FilterOption } from './types'

export default function AnswerFilterMultiSelect({
  values,
  options,
  placeholder,
  onToggle,
  onClear,
  buttonClassName = '',
}: {
  values: string[]
  options: FilterOption[]
  placeholder: string
  onToggle: (value: string) => void
  onClear: () => void
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const valueSet = useMemo(() => new Set(values), [values])
  const selectedOptions = options.filter((option) => valueSet.has(option.value))
  const label = selectedOptions.length === 0
    ? placeholder
    : selectedOptions.length === 1
      ? selectedOptions[0].label
      : `${selectedOptions.length} filters selected`

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
        className={`interactive-press flex h-11 w-full items-center justify-between gap-3 rounded-xl border bg-[var(--bg-sunken)] px-3 text-left text-sm text-[var(--text)] ${
          open ? 'border-[var(--accent)] bg-white ring-2 ring-[var(--accent-ring)]' : 'border-[var(--border-strong)] hover:bg-white'
        } ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" className="control-menu absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-auto p-1">
          {values.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="mb-1 flex min-h-9 w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
            >
              Clear filters
            </button>
          )}
          {options.map((option) => {
            const selected = valueSet.has(option.value)
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onToggle(option.value)}
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? 'bg-[var(--accent-subtle)] font-semibold text-[var(--accent-active)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]'
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border-strong)] bg-white'}`}>
                  {selected && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M2.5 6.2 4.8 8.5 9.5 3.5" />
                    </svg>
                  )}
                </span>
                {option.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />}
                <span className="truncate">{option.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
