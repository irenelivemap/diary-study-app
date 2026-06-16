'use client'

import { useEffect, useRef, useState } from 'react'

type Option = { value: string; label: string }

export default function SelectMenu({
  value,
  defaultValue,
  options,
  onChange,
  label,
  name,
  className = '',
  buttonClassName = '',
  disabled = false,
}: {
  value?: string
  defaultValue?: string
  options: Option[]
  onChange?: (value: string) => void
  label?: string
  name?: string
  className?: string
  buttonClassName?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [internalValue, setInternalValue] = useState(defaultValue ?? options[0]?.value ?? '')
  const ref = useRef<HTMLDivElement>(null)
  const currentValue = value ?? internalValue
  const selected = options.find((option) => option.value === currentValue) ?? options[0]
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selected?.value))

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function choose(nextValue: string) {
    setInternalValue(nextValue)
    onChange?.(nextValue)
    setOpen(false)
  }

  function chooseByIndex(nextIndex: number) {
    const next = options[Math.min(options.length - 1, Math.max(0, nextIndex))]
    if (next) choose(next.value)
  }

  return (
    <div ref={ref} className={`relative ${label ? 'space-y-1' : ''} ${className}`}>
      {name && <input type="hidden" name={name} value={currentValue} />}
      {label && <span className="block text-sm font-semibold text-slate-700">{label}</span>}
      <button
        type="button"
        onClick={() => !disabled && setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (disabled) return
          if (event.key === 'Escape') {
            setOpen(false)
            return
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!open) setOpen(true)
            else chooseByIndex(selectedIndex + 1)
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) setOpen(true)
            else chooseByIndex(selectedIndex - 1)
          }
          if (event.key === 'Home') {
            event.preventDefault()
            chooseByIndex(0)
          }
          if (event.key === 'End') {
            event.preventDefault()
            chooseByIndex(options.length - 1)
          }
        }}
        className={`interactive-press flex h-11 w-full items-center justify-between gap-3 rounded-xl border bg-[var(--bg-sunken)] px-3 text-left text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60 ${
          open ? 'border-[var(--accent)] bg-white ring-2 ring-[var(--accent-ring)]' : 'border-[var(--border-strong)] hover:bg-white'
        } ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="truncate">{selected?.label}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div role="listbox" className="control-menu absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-auto p-1">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === currentValue}
              onClick={() => choose(option.value)}
              className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                option.value === currentValue
                  ? 'bg-[var(--accent-subtle)] font-semibold text-[var(--accent-active)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]'
              }`}
            >
              <span className="truncate">{option.label}</span>
              {option.value === currentValue && <span className="text-[var(--accent)]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
