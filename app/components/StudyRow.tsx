'use client'
import { useState, useRef, useTransition } from 'react'
import Link from 'next/link'
import { toggleStudyStatus, renameStudy } from '@/app/actions/studies'
import StudyActionsMenu from '@/app/components/StudyActionsMenu'
import { ButtonLink, SwitchVisual } from '@/app/components/ui'

type Props = {
  study: {
    id: string
    name: string
    description: string | null
    isActive: boolean
    _count: { participants: number; entries: number }
  }
}

export default function StudyRow({ study }: Props) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [name, setName] = useState(study.name)
  const [active, setActive] = useState(study.isActive)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function startRename() {
    setIsRenaming(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitRename() {
    if (!name.trim() || name.trim() === study.name) {
      setName(study.name)
      setIsRenaming(false)
      return
    }
    setIsRenaming(false)
    startTransition(() => renameStudy(study.id, name.trim()))
  }

  function handleToggle() {
    const previous = active
    setActive(!previous)
    startTransition(() => toggleStudyStatus(study.id, previous))
  }

  return (
    <div className={`flex flex-col gap-4 bg-white rounded-2xl border px-5 py-5 shadow-sm transition-all group sm:flex-row sm:items-center sm:justify-between ${isPending ? 'opacity-60' : 'border-slate-100 hover:border-indigo-200 hover:shadow-md'}`}>
      <div className="flex items-start gap-4 min-w-0 flex-1">
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') { setName(study.name); setIsRenaming(false) }
              }}
              className="font-semibold text-lg text-slate-900 bg-transparent border-b-2 border-indigo-400 outline-none w-full"
            />
          ) : (
            <div className="flex items-center gap-2">
              <Link href={`/admin/studies/${study.id}`}
                className="font-semibold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                {name}
              </Link>
              <button
                type="button"
                onClick={startRename}
                title="Rename study"
                aria-label={`Rename ${name}`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </div>
          )}
          {study.description && (
            <p className="text-sm text-slate-500 mt-1 line-clamp-2 max-w-2xl">{study.description}</p>
          )}
          <p className="text-sm text-slate-500 mt-2">
            {study._count.participants} participant{study._count.participants === 1 ? '' : 's'} · {study._count.entries} entr{study._count.entries === 1 ? 'y' : 'ies'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 sm:ml-4">
        <ButtonLink href={`/admin/studies/${study.id}`} size="md">
          Open study
        </ButtonLink>
        <button
          type="button"
          onClick={handleToggle}
          title={active ? 'Deactivate study' : 'Activate study'}
          aria-pressed={active}
          className="inline-flex h-10 items-center gap-2.5 rounded-xl px-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <SwitchVisual checked={active} />
          <span>{active ? 'Active' : 'Inactive'}</span>
        </button>
        <StudyActionsMenu studyId={study.id} studyName={name} />
      </div>
    </div>
  )
}
