'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ButtonLink } from '@/app/components/ui'
import StudyStatusToggle from '@/app/components/StudyStatusToggle'

type Tab = 'overview' | 'participants' | 'analysis' | 'responses' | 'setup' | 'preview'

type Props = {
  studyId: string
  active?: Tab
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
  const activeTab = active ?? activeTabFromPath(pathname, studyId)

  useEffect(() => {
    if (pendingHref === pathname) setPendingHref(null)
  }, [pathname, pendingHref])

  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col gap-4 pb-3 pt-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Link href="/admin" className="interactive-press inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13L5 8l5-5" /></svg>
              All studies
            </Link>
            <h1 className="mt-2 truncate text-2xl font-bold leading-tight text-slate-950">{studyName}</h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {status !== 'ARCHIVED' && (
              <StudyStatusToggle studyId={studyId} initialStatus={status} />
            )}
            <ButtonLink
              href={`/admin/studies/${studyId}/preview`}
              tone={activeTab === 'preview' ? 'primary' : 'secondary'}
              size="md"
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
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={`relative -mb-px min-h-11 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab.id || (pendingHref === tab.href(studyId) && pathname !== pendingHref)
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:border-[var(--border-strong)] hover:text-[var(--text)]'
              }`}
            >
              {tab.label}
              {pendingHref === tab.href(studyId) && pathname !== pendingHref && (
                <span className="absolute bottom-0 left-4 right-4 h-0.5 animate-pulse rounded-full bg-[var(--accent-muted)]" />
              )}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

function activeTabFromPath(pathname: string, studyId: string): Tab {
  const base = `/admin/studies/${studyId}`
  if (pathname === `${base}/participants` || pathname.startsWith(`${base}/participants/`)) return 'participants'
  if (pathname === `${base}/analysis` || pathname.startsWith(`${base}/analysis/`)) return 'analysis'
  if (pathname === `${base}/data`) return 'responses'
  if (pathname === `${base}/edit`) return 'setup'
  if (pathname === `${base}/preview`) return 'preview'
  return 'overview'
}
