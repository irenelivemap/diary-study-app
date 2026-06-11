'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { archiveStudy, deleteStudy, duplicateStudy, restoreStudy } from '@/app/actions/studies'
import { Button, TrashIcon } from '@/app/components/ui'

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
  const [confirmation, setConfirmation] = useState<null | 'archive' | 'restore' | 'delete'>(null)
  const [deleteText, setDeleteText] = useState('')
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
    setConfirmation('archive')
  }

  function handleRestore() {
    setOpen(false)
    setConfirmation('restore')
  }

  function handleDuplicate() {
    setOpen(false)
    startTransition(() => duplicateStudy(studyId))
  }

  function handleDelete() {
    setOpen(false)
    setDeleteText('')
    setConfirmation('delete')
  }

  function closeConfirmation() {
    if (isPending) return
    setConfirmation(null)
    setDeleteText('')
  }

  function confirmAction() {
    if (confirmation === 'archive') startTransition(() => archiveStudy(studyId))
    if (confirmation === 'restore') startTransition(() => restoreStudy(studyId))
    if (confirmation === 'delete' && deleteText === 'DELETE') startTransition(() => deleteStudy(studyId))
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

      {confirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">
                  {confirmation === 'archive' && 'Archive study?'}
                  {confirmation === 'restore' && 'Restore study?'}
                  {confirmation === 'delete' && 'Delete study permanently?'}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {confirmation === 'archive' && `"${studyName}" will move to Past studies. Responses and analysis will be kept.`}
                  {confirmation === 'restore' && `"${studyName}" will return to Current studies as a closed study. Participants will not be able to submit until you make it active.`}
                  {confirmation === 'delete' && `This will permanently delete "${studyName}" and all participant responses. This cannot be undone.`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeConfirmation}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close study action confirmation"
              >
                x
              </button>
            </div>

            {confirmation === 'delete' && (
              <label className="mt-5 block">
                <span className="text-sm font-semibold text-slate-800">Type DELETE to confirm</span>
                <input
                  value={deleteText}
                  onChange={(event) => setDeleteText(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-950 placeholder-red-300 focus:border-red-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="DELETE"
                />
              </label>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" tone="secondary" onClick={closeConfirmation} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="button"
                tone={confirmation === 'delete' ? 'danger' : 'primary'}
                onClick={confirmAction}
                disabled={isPending || (confirmation === 'delete' && deleteText !== 'DELETE')}
              >
                {confirmation === 'archive' && 'Archive study'}
                {confirmation === 'restore' && 'Restore study'}
                {confirmation === 'delete' && 'Delete permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
