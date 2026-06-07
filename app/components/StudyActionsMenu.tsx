'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { archiveStudy, deleteStudy, duplicateStudy, restoreStudy } from '@/app/actions/studies'

type Props = {
  studyId: string
  studyName: string
  archived?: boolean
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
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-bold leading-none text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
      >
        ...
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleDuplicate}
            className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Copy study
          </button>
          {archived ? (
            <button
              type="button"
              role="menuitem"
              onClick={handleRestore}
              className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Restore to current
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={handleArchive}
              className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Archive study
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={handleDelete}
            className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Delete permanently
          </button>
        </div>
      )}
    </div>
  )
}
