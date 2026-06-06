'use client'
import { useState, useTransition } from 'react'
import { ensureInviteLink } from '@/app/actions/studies'
import { Button } from '@/app/components/ui'

export default function InviteLinkCard({ studyId, initialToken, embedded = false }: { studyId: string; initialToken?: string | null; embedded?: boolean }) {
  const [token, setToken] = useState(initialToken ?? '')
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  const link = token ? `/join/${token}` : ''

  function createLink() {
    startTransition(async () => {
      const result = await ensureInviteLink(studyId)
      setToken(result.token)
    })
  }

  async function copyLink() {
    if (!token) return
    await navigator.clipboard.writeText(`${window.location.origin}/join/${token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={`${embedded ? 'px-5 py-4' : 'bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4'} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4`}>
      <div>
        {!embedded && (
          <>
            <h2 className="text-sm font-semibold text-slate-800">Invite link</h2>
            <p className="text-sm text-slate-400 mt-0.5">Share this with participants so they can join the study after signing in.</p>
          </>
        )}
        {link && <p className="text-xs text-slate-500 mt-2 break-all bg-slate-50 rounded-lg px-3 py-2">{link}</p>}
      </div>
      {token ? (
        <Button type="button" onClick={copyLink} className="shrink-0">
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      ) : (
        <Button type="button" onClick={createLink} disabled={pending} className="shrink-0">
          {pending ? 'Creating…' : 'Create invite'}
        </Button>
      )}
    </div>
  )
}
