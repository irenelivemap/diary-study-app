'use client'
/**
 * Admin control for changing study lifecycle status.
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import { setStudyLifecycleStatus } from '@/app/actions/studies'
import { Button } from '@/app/components/ui'

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
  PREPARATION: 'Design and pilot testing. Entries stay separate from fieldwork data until launch.',
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
  const [confirmLaunchOpen, setConfirmLaunchOpen] = useState(false)
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
    if (status === 'PREPARATION' && nextStatus === 'ACTIVE') {
      setOpen(false)
      setConfirmLaunchOpen(true)
      return
    }
    commitStatus(nextStatus)
  }

  function commitStatus(nextStatus: StudyStatusValue) {
    setStatus(nextStatus)
    setOpen(false)
    startTransition(() => setStudyLifecycleStatus(studyId, nextStatus))
  }

  function chooseByIndex(nextIndex: number) {
    const next = STATUSES[Math.min(STATUSES.length - 1, Math.max(0, nextIndex))]
    if (next) handleChange(next)
  }

  return (
    <>
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
          className={`interactive-press inline-flex h-10 min-w-[138px] items-center justify-between gap-2 rounded-xl border bg-[var(--bg-surface)] px-3 text-sm font-semibold text-[var(--text)] shadow-[var(--shadow-sm)] disabled:cursor-not-allowed ${
            open ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)]' : 'border-[var(--border-strong)] hover:bg-[var(--bg-sunken)]'
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
          <div role="listbox" className="control-menu absolute right-0 top-full z-40 mt-1 min-w-56 p-1">
            {STATUSES.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option === status}
                onClick={() => handleChange(option)}
                className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  option === status
                    ? 'bg-[var(--accent-subtle)] font-semibold text-[var(--accent-active)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]'
                }`}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${STATUS_DOT_CLASSES[option]}`} />
                  <span className="truncate">{STATUS_LABELS[option]}</span>
                </span>
                {option === status && <span className="text-[var(--accent)]">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {confirmLaunchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="surface-card w-full max-w-lg p-5 shadow-[var(--shadow-xl)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">Launch this study?</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  This moves the study from preparation into fieldwork.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmLaunchOpen(false)}
                className="interactive-press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close launch dialog"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {[
                'Pilot entries stay excluded from analysis, data tables, exports, participant progress, and reminders.',
                'New entries submitted after launch count as fieldwork data.',
                'Automatic reminders can run only while the study is active.',
                'Participants will not see any pilot or preparation language.',
              ].map((item) => (
                <div key={item} className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] p-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">✓</span>
                  <p className="text-sm leading-snug text-slate-700">{item}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" tone="secondary" onClick={() => setConfirmLaunchOpen(false)}>
                Keep in preparation
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setConfirmLaunchOpen(false)
                  commitStatus('ACTIVE')
                }}
              >
                Launch study
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
