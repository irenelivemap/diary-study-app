'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'

type Props = {
  title: string
  description?: string
  count?: string | number
  action?: ReactNode
  defaultOpen?: boolean
  tone?: 'default' | 'info' | 'danger'
  children: ReactNode
}

const SECTION_TONES = {
  default: {
    shell: 'border-slate-100 bg-white',
    title: 'text-slate-800',
    count: 'bg-slate-100 text-slate-500',
    border: 'border-slate-100',
  },
  info: {
    shell: 'border-indigo-100 bg-indigo-50/30',
    title: 'text-indigo-950',
    count: 'bg-indigo-100 text-indigo-700',
    border: 'border-indigo-100',
  },
  danger: {
    shell: 'border-red-200 bg-red-50/40',
    title: 'text-red-950',
    count: 'bg-red-100 text-red-700',
    border: 'border-red-100',
  },
}

export default function OverviewSection({ title, description, count, action, defaultOpen = false, tone = 'default', children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const styles = SECTION_TONES[tone]

  return (
    <details
      className={`group rounded-2xl border shadow-sm overflow-hidden ${styles.shell}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 marker:hidden transition-colors hover:bg-slate-50/70">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-base font-semibold ${styles.title}`}>{title}</span>
            {count !== undefined && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles.count}`}>
                {count}
              </span>
            )}
          </div>
          {description && <p className="mt-0.5 text-sm text-slate-500 leading-snug">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {action}
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
          </span>
        </div>
      </summary>
      {open && (
        <div className={`border-t ${styles.border}`}>
          {children}
        </div>
      )}
    </details>
  )
}
