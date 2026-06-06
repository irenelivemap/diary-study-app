'use client'
import { useActionState } from 'react'
import { updateParticipantOps } from '@/app/actions/studies'
import { Button, TextInput } from '@/app/components/ui'
import SelectMenu from '@/app/components/SelectMenu'

type Props = {
  studyId: string
  userId: string
  name: string
  email: string
  notes?: string | null
  incentiveStatus: 'NOT_TRACKED' | 'PENDING' | 'PAID' | 'EXCLUDED'
}

export default function ParticipantOpsForm({ studyId, userId, name, email, notes, incentiveStatus }: Props) {
  const [state, action, pending] = useActionState(updateParticipantOps, null)

  return (
    <form action={action} className="grid grid-cols-1 lg:grid-cols-[minmax(180px,0.7fr)_160px_minmax(220px,1fr)_auto] gap-3 items-start">
      <input type="hidden" name="studyId" value={studyId} />
      <input type="hidden" name="userId" value={userId} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{name}</p>
        <p className="text-xs text-slate-400 truncate">{email}</p>
      </div>
      <SelectMenu
        name="incentiveStatus"
        defaultValue={incentiveStatus}
        options={[
          { value: 'NOT_TRACKED', label: 'Not tracked' },
          { value: 'PENDING', label: 'Pending' },
          { value: 'PAID', label: 'Paid' },
          { value: 'EXCLUDED', label: 'Excluded' },
        ]}
      />
      <TextInput
        name="researcherNotes"
        defaultValue={notes ?? ''}
        placeholder="Private researcher note"
      />
      <Button
        disabled={pending}
        tone="secondary"
      >
        {pending ? 'Saving…' : state?.success ? 'Saved' : 'Save'}
      </Button>
    </form>
  )
}
