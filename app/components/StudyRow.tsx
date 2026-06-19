'use client'
import { useState, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { renameStudy } from '@/app/actions/studies'
import StudyActionsMenu from '@/app/components/StudyActionsMenu'
import StudyStatusToggle from '@/app/components/StudyStatusToggle'

type Props = {
  study: {
    id: string
    name: string
    description: string | null
    isActive: boolean
    status: 'PREPARATION' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED'
    _count: { participants: number; entries: number }
  }
}

export default function StudyRow({ study }: Props) {
  const router = useRouter()
  const [isRenaming, setIsRenaming] = useState(false)
  const [name, setName] = useState(study.name)
  const [isOpening, setIsOpening] = useState(false)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const studyHref = `/admin/studies/${study.id}`

  function prefetchStudy() {
    router.prefetch(studyHref)
  }

  function markOpening(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) return
    setIsOpening(true)
  }

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

  return (
    <div className={`group surface-card flex flex-col gap-4 px-5 py-5 transition-all sm:flex-row sm:items-center sm:justify-between ${isPending || isOpening ? 'opacity-70' : 'hover:border-[var(--accent-muted)] hover:shadow-[var(--shadow-lg)]'}`}>
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
              <Link
                href={studyHref}
                onMouseEnter={prefetchStudy}
                onFocus={prefetchStudy}
                onClick={markOpening}
                aria-busy={isOpening}
                className="font-semibold text-lg text-slate-900 transition-colors group-hover:text-[var(--accent)] truncate"
              >
                {name}
              </Link>
              <button
                type="button"
                onClick={startRename}
                title="Rename study"
                aria-label={`Rename ${name}`}
                className="interactive-press inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-white text-slate-500 hover:bg-[var(--bg-sunken)] hover:text-slate-900"
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
        <p className="tabular text-sm text-[var(--text-tertiary)] mt-2">
            {study._count.participants} participant{study._count.participants === 1 ? '' : 's'} · {study._count.entries} entr{study._count.entries === 1 ? 'y' : 'ies'}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-4">
        {isOpening && <span className="text-sm font-semibold text-[var(--text-tertiary)]">Opening…</span>}
        <StudyStatusToggle studyId={study.id} initialStatus={study.status === 'ARCHIVED' ? 'CLOSED' : study.status} />
        <StudyActionsMenu studyId={study.id} studyName={name} />
      </div>
    </div>
  )
}
