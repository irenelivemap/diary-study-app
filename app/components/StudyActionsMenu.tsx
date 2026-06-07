'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { archiveStudy, deleteStudy, duplicateStudy, restoreStudy } from '@/app/actions/studies'
import { TrashIcon } from '@/app/components/ui'

type Props = {
  studyId: string
  studyName: string
  archived?: boolean
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7h18" />
      <path d="M5 7v12h14V7" />
      <path d="M8 7V4h8v3" />
      <path d="M10 12h4" />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v6h6" />
    </svg>
  )
}

export default function StudyActionsMenu({ studyId, studyName, archived = false }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  function handleArchive() {
    setOpen(false)
    if (!confirm(`Archive "${studyName}"? Responses will be kept, and the study will move to Past studies.`)) return
    startTransition(() => archiveStudy(studyId))
  }

  function handleRestore() {
    setOpen(false)
    if (!confirm(`Move "${studyName}" back to current studies?`)) return
    startTransition(() => restoreStudy(studyId))
  }

  function handleDuplicate() {
    setOpen(false)
    startTransition(() => duplicateStudy(studyId))
  }

  function handleDelete() {
    setOpen(false)
    if (!confirm(`Permanently delete "${studyName}" and all participant responses? This cannot be undone.`)) return
    startTransition(() => deleteStudy(studyId))
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${studyName}`}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <MoreIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleDuplicate}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <CopyIcon />
            </span>
            Copy study
          </button>
          {archived ? (
            <button
              type="button"
              role="menuitem"
              onClick={handleRestore}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <RestoreIcon />
              </span>
              Restore to current
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={handleArchive}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <ArchiveIcon />
              </span>
              Archive study
            </button>
          )}
          <div className="my-1.5 h-px bg-slate-100" />
          <button
            type="button"
            role="menuitem"
            onClick={handleDelete}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
              <TrashIcon />
            </span>
            Delete permanently
          </button>
        </div>
      )}
    </div>
  )
}
