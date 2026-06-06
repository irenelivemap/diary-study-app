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
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/studies/${study.id}`} className="text-lg font-semibold text-slate-900 transition-colors hover:text-indigo-700">
            {study.name}
          </Link>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-600">Past</span>
        </div>
        {study.description && (
          <p className="mt-1 max-w-2xl text-sm text-slate-500 line-clamp-2">{study.description}</p>
        )}
        <p className="mt-2 text-sm text-slate-500">
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
