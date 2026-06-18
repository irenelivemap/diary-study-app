'use client'
import { useActionState, useState } from 'react'
import { addParticipant } from '@/app/actions/studies'
import { Button, TextInput } from '@/app/components/ui'

export default function AddParticipantForm({ studyId }: { studyId: string }) {
  const [state, action, pending] = useActionState(addParticipant, null)
  const [copied, setCopied] = useState(false)

  async function copyInviteLink() {
    const inviteUrl = state?.inviteUrl
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

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
      {state?.success && (
        <div className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
          <p className="text-xs leading-relaxed text-emerald-700">
            {state.message ?? 'Invitation saved.'}
            {state.emailSent && ' If it does not arrive, copy the invite link below.'}
          </p>
          {state.inviteUrl && (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={state.inviteUrl}
                className="min-w-0 flex-1 rounded-lg border border-emerald-100 bg-white px-2.5 py-2 text-xs text-slate-600"
                aria-label="Participant invite link"
              />
              <Button type="button" tone="secondary" size="sm" onClick={copyInviteLink}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
        </div>
      )}
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
