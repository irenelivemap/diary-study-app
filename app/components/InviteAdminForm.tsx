'use client'
/**
 * Admin profile form for inviting another admin user.
 */

import { useActionState, useState } from 'react'
import { inviteAdmin } from '@/app/actions/team'
import { Button, TextInput } from '@/app/components/ui'

export default function InviteAdminForm() {
  const [state, action, pending] = useActionState(inviteAdmin, null)
  const [copied, setCopied] = useState(false)

  async function copySetupLink() {
    if (!state?.setupUrl) return
    await navigator.clipboard.writeText(state.setupUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <form action={action} className="border-b border-slate-100 bg-slate-50/45 px-5 py-4 sm:px-6">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-slate-950">Invite admin</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          Add someone who should be able to manage studies and researcher settings.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="admin-email" className="mb-2 block text-sm font-medium text-slate-700">Email address</label>
          <TextInput id="admin-email" name="email" type="email" required placeholder="colleague@example.com" />
        </div>
        <div>
          <label htmlFor="admin-name" className="mb-2 block text-sm font-medium text-slate-700">Name</label>
          <TextInput id="admin-name" name="name" placeholder="Optional" />
        </div>
        <Button type="submit" disabled={pending} className="sm:mb-0">
          {pending ? 'Inviting...' : 'Invite admin'}
        </Button>
      </div>

      {state?.error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
      {state?.success && (
        <div className="mt-4 space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
          <p className="text-sm leading-relaxed text-emerald-700">{state.message}</p>
          {state.setupUrl && (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={state.setupUrl}
                aria-label="Admin setup link"
                className="min-w-0 flex-1 rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-slate-600"
              />
              <Button type="button" tone="secondary" size="sm" onClick={copySetupLink}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
        </div>
      )}
    </form>
  )
}
