'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ButtonLink } from '@/app/components/ui'
import StudyStatusToggle from '@/app/components/StudyStatusToggle'

type Tab = 'overview' | 'participants' | 'analysis' | 'responses' | 'setup' | 'preview'

type Props = {
  studyId: string
  active: Tab
  studyName: string
  isActive: boolean
  status: 'PREPARATION' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED'
}

const TABS: { id: Tab; label: string; href: (id: string) => string }[] = [
  { id: 'overview',   label: 'Overview',   href: (id) => `/admin/studies/${id}` },
  { id: 'participants', label: 'Participants', href: (id) => `/admin/studies/${id}/participants` },
  { id: 'analysis',  label: 'Analysis',  href: (id) => `/admin/studies/${id}/analysis` },
  { id: 'responses',  label: 'Data',  href: (id) => `/admin/studies/${id}/data` },
  { id: 'setup',      label: 'Setup',      href: (id) => `/admin/studies/${id}/edit` },
]

export default function StudyTabs({ studyId, active, studyName, status }: Props) {
  const pathname = usePathname()
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  return (
    <div className="bg-white border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="pt-5 pb-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Link href="/admin" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900">
              <span aria-hidden="true">←</span>
              All studies
            </Link>
            <h1 className="text-2xl font-bold leading-tight text-slate-950 mt-2 truncate">{studyName}</h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {status !== 'ARCHIVED' && (
              <StudyStatusToggle studyId={studyId} initialStatus={status} />
            )}
            <ButtonLink
              href={`/admin/studies/${studyId}/preview`}
              tone={active === 'preview' ? 'primary' : 'secondary'}
              size="sm"
              className="shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Preview
            </ButtonLink>
          </div>
        </div>

        <nav aria-label="Study sections" className="scrollbar-hidden flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href(studyId)}
              prefetch
              onClick={() => setPendingHref(tab.href(studyId))}
              aria-current={active === tab.id ? 'page' : undefined}
              className={`relative px-4 py-3 text-base font-medium border-b-2 transition-colors -mb-px ${
                active === tab.id || (pendingHref === tab.href(studyId) && pathname !== pendingHref)
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              {tab.label}
              {pendingHref === tab.href(studyId) && pathname !== pendingHref && (
                <span className="absolute bottom-0 left-4 right-4 h-0.5 animate-pulse rounded-full bg-indigo-300" />
              )}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
