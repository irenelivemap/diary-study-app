'use client'

import { useState, useTransition } from 'react'
import { toggleStudyStatus } from '@/app/actions/studies'
import { SwitchVisual } from '@/app/components/ui'

type Props = {
  studyId: string
  initialActive: boolean
}

export default function StudyStatusToggle({ studyId, initialActive }: Props) {
  const [active, setActive] = useState(initialActive)
  const [pending, startTransition] = useTransition()

  function handleToggle() {
    const previous = active
    setActive(!previous)
    startTransition(() => toggleStudyStatus(studyId, previous))
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      aria-pressed={active}
      className="inline-flex h-10 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
    >
      <SwitchVisual checked={active} />
      <span>{active ? 'Active' : 'Inactive'}</span>
    </button>
  )
}
