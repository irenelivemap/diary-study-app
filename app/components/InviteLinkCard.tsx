'use client'
import { useState, useTransition } from 'react'
import { ensureInviteLink } from '@/app/actions/studies'
import { Button } from '@/app/components/ui'

export default function InviteLinkCard({
  studyId,
  initialToken,
  embedded = false,
  baseUrl = '',
}: {
  studyId: string
  initialToken?: string | null
  embedded?: boolean
  baseUrl?: string
}) {
  const [token, setToken] = useState(initialToken ?? '')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '')
  const link = token ? `${normalizedBaseUrl || ''}/join/${token}` : ''

  function createLink() {
    setError('')
    startTransition(async () => {
      const result = await ensureInviteLink(studyId)
      if (result.error) {
        setError(result.error)
        return
      }
      setToken(result.token ?? '')
    })
  }

  async function copyLink() {
    if (!token) return
    await navigator.clipboard.writeText(link || `${window.location.origin}/join/${token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={`${embedded ? 'px-5 py-4' : 'bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4'} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4`}>
      <div>
        {!embedded && (
          <>
            <h2 className="text-sm font-semibold text-slate-800">Invite link</h2>
            <p className="text-sm text-slate-500 mt-0.5">Share this with participants so they can join the study after signing in.</p>
          </>
        )}
        {link && <p className="text-xs text-slate-500 mt-2 break-all bg-slate-50 rounded-lg px-3 py-2">{link}</p>}
        {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
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
