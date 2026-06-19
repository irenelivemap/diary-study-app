'use client'
/**
 * Reusable button for copying text such as invite links.
 */

import { useState } from 'react'

export default function CopyTextButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      }}
      className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
    >
      {copied ? 'Copied' : 'Copy quote'}
    </button>
  )
}
