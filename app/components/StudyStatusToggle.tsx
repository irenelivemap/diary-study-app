'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { setStudyLifecycleStatus } from '@/app/actions/studies'

type StudyStatusValue = 'PREPARATION' | 'ACTIVE' | 'CLOSED'

type Props = {
  studyId: string
  initialStatus: StudyStatusValue
}

const STATUSES: StudyStatusValue[] = ['PREPARATION', 'ACTIVE', 'CLOSED']
const STATUS_LABELS: Record<StudyStatusValue, string> = {
  PREPARATION: 'In preparation',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
}
const STATUS_HELP: Record<StudyStatusValue, string> = {
  PREPARATION: 'Design and pilot testing. Entries are test data until launch.',
  ACTIVE: 'Real fieldwork is running. Participants can join and submit entries.',
  CLOSED: 'Fieldwork is stopped. Data, analysis and exports stay available.',
}
const STATUS_DOT_CLASSES: Record<StudyStatusValue, string> = {
  PREPARATION: 'bg-sky-500 ring-sky-100',
  ACTIVE: 'bg-emerald-500 ring-emerald-100',
  CLOSED: 'bg-slate-400 ring-slate-100',
}

export default function StudyStatusToggle({ studyId, initialStatus }: Props) {
  const [status, setStatus] = useState<StudyStatusValue>(initialStatus)
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const selectedIndex = Math.max(0, STATUSES.indexOf(status))

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function handleChange(nextStatus: StudyStatusValue) {
    if (nextStatus === status) {
      setOpen(false)
      return
    }
    setStatus(nextStatus)
    setOpen(false)
    startTransition(() => setStudyLifecycleStatus(studyId, nextStatus))
  }

  function chooseByIndex(nextIndex: number) {
    const next = STATUSES[Math.min(STATUSES.length - 1, Math.max(0, nextIndex))]
    if (next) handleChange(next)
  }

  return (
    <div ref={ref} className={`relative inline-flex ${pending ? 'opacity-60' : ''}`} title={STATUS_HELP[status]}>
      <span className="sr-only">Study status</span>
      <button
        type="button"
        onClick={() => !pending && setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (pending) return
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
            chooseByIndex(STATUSES.length - 1)
          }
        }}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex h-10 min-w-[138px] items-center justify-between gap-2 rounded-xl border bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed ${
          open ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200'
        }`}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${STATUS_DOT_CLASSES[status]}`} />
          <span className="truncate">{STATUS_LABELS[status]}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div role="listbox" className="absolute right-0 top-full z-40 mt-1 min-w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {STATUSES.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === status}
              onClick={() => handleChange(option)}
              className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                option === status
                  ? 'bg-indigo-50 font-semibold text-indigo-700'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${STATUS_DOT_CLASSES[option]}`} />
                <span className="truncate">{STATUS_LABELS[option]}</span>
              </span>
              {option === status && <span className="text-indigo-600">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
