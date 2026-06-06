'use client'
import { useActionState } from 'react'
import { addParticipant } from '@/app/actions/studies'
import { Button, TextInput } from '@/app/components/ui'

export default function AddParticipantForm({ studyId }: { studyId: string }) {
  const [state, action, pending] = useActionState(addParticipant, null)

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="studyId" value={studyId} />
      <TextInput
        name="email"
        type="email"
        placeholder="Participant email address"
        required
      />
      <TextInput
        name="externalParticipantId"
        placeholder="External participant ID (optional)"
      />
      <p className="text-xs leading-relaxed text-slate-500">
        Use this for TestingTime or another recruiting platform. Do not enter payment details here.
      </p>
      {state?.error && <p className="text-xs text-red-500">{state.error}</p>}
      {state?.success && <p className="text-xs text-emerald-600">{state.message ?? 'Invitation sent.'}</p>}
      <Button
        type="submit"
        disabled={pending}
        className="w-full"
      >
        {pending ? 'Sending…' : 'Send invitation'}
      </Button>
    </form>
  )
}
