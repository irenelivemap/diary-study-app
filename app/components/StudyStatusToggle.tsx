'use client'

import { useState, useTransition } from 'react'
import { setStudyLifecycleStatus } from '@/app/actions/studies'

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
  PREPARATION: 'Design and pilot testing. Entries are test data until launch.',
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
  const [pending, startTransition] = useTransition()

  function handleChange(nextStatus: StudyStatusValue) {
    setStatus(nextStatus)
    startTransition(() => setStudyLifecycleStatus(studyId, nextStatus))
  }

  return (
    <label
      title={STATUS_HELP[status]}
      className={`inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold shadow-sm transition-colors ${pending ? 'opacity-60' : ''}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ring-4 ${STATUS_DOT_CLASSES[status]}`} />
      <span className="sr-only">Study status</span>
      <select
        value={status}
        onChange={(event) => handleChange(event.target.value as StudyStatusValue)}
        disabled={pending}
        className="bg-transparent pr-1 text-slate-800 outline-none"
      >
        {STATUSES.map((option) => (
          <option key={option} value={option}>{STATUS_LABELS[option]}</option>
        ))}
      </select>
    </label>
  )
}
