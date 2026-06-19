'use client'

import { useActionState, useState } from 'react'
import { removeAdminAccess } from '@/app/actions/team'
import { Button } from '@/app/components/ui'

export default function RemoveAdminAccessForm({ adminId, adminName }: {
  adminId: string
  adminName: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [state, action, pending] = useActionState(removeAdminAccess, null)

  if (!confirming) {
    return (
      <button
        type="button"
        aria-label={`Remove admin access for ${adminName}`}
        onClick={() => setConfirming(true)}
        className="interactive-press inline-flex h-9 items-center rounded-lg px-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger-text)]"
      >
        Remove access
      </button>
    )
  }

  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="adminId" value={adminId} />
      <span className="text-sm text-slate-500">Remove {adminName}?</span>
      <Button type="submit" tone="danger" size="sm" disabled={pending}>
        {pending ? 'Removing...' : 'Confirm'}
      </Button>
      <Button type="button" tone="secondary" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      {state?.error && <p className="basis-full text-right text-sm text-red-700">{state.error}</p>}
    </form>
  )
}
