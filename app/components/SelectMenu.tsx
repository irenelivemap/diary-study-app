'use client'
/**
 * Reusable select/menu component that portals its listbox to avoid clipping inside cards.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
  const [menuStyle, setMenuStyle] = useState({ left: 0, top: 0, width: 0, maxHeight: 288 })
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const currentValue = value ?? internalValue
  const selected = options.find((option) => option.value === currentValue) ?? options[0]
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selected?.value))

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  useEffect(() => {
    if (!open) return

    function positionMenu() {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return

      const viewportPadding = 8
      const belowSpace = window.innerHeight - rect.bottom - viewportPadding
      const aboveSpace = rect.top - viewportPadding
      const preferredMaxHeight = 288
      const opensUp = belowSpace < 180 && aboveSpace > belowSpace
      const maxHeight = Math.max(120, Math.min(preferredMaxHeight, opensUp ? aboveSpace : belowSpace))
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding)
      )
      const top = opensUp
        ? Math.max(viewportPadding, rect.top - maxHeight - 4)
        : Math.min(window.innerHeight - viewportPadding, rect.bottom + 4)

      setMenuStyle({ left, top, width: rect.width, maxHeight })
    }

    positionMenu()
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    return () => {
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
    }
  }, [open])

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
        ref={buttonRef}
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
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="control-menu fixed z-[80] overflow-auto p-1"
          style={{
            left: menuStyle.left,
            top: menuStyle.top,
            width: menuStyle.width,
            maxHeight: menuStyle.maxHeight,
          }}
        >
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
        </div>,
        document.body
      )}
    </div>
  )
}
