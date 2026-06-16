'use client'

import Link from 'next/link'
import StudyActionsMenu from '@/app/components/StudyActionsMenu'
import { ButtonLink } from '@/app/components/ui'

type Props = {
  study: {
    id: string
    name: string
    description: string | null
    updatedAt: Date
    _count: { participants: number; entries: number }
  }
}

function formatArchivedDate(date: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export default function ArchivedStudyRow({ study }: Props) {
  return (
    <div className="surface-card-soft flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/studies/${study.id}`} className="text-lg font-semibold text-slate-900 transition-colors hover:text-[var(--accent)]">
            {study.name}
          </Link>
          <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Archived</span>
        </div>
        {study.description && (
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-tertiary)] line-clamp-2">{study.description}</p>
        )}
        <p className="tabular mt-2 text-sm text-[var(--text-tertiary)]">
          Archived {formatArchivedDate(study.updatedAt)} · {study._count.participants} participant{study._count.participants === 1 ? '' : 's'} · {study._count.entries} entr{study._count.entries === 1 ? 'y' : 'ies'}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <ButtonLink href={`/admin/studies/${study.id}`} tone="secondary" size="md">
          Open
        </ButtonLink>
        <StudyActionsMenu studyId={study.id} studyName={study.name} archived />
      </div>
    </div>
  )
}
