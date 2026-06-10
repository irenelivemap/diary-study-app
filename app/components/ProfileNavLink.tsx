'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

type Props = {
  name: string
  role: 'ADMIN' | 'PARTICIPANT'
  profileHref?: string
}

export default function ProfileNavLink({ name, role, profileHref }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentQuery = searchParams.toString()
  const currentPath = `${pathname}${currentQuery ? `?${currentQuery}` : ''}`
  const from = role === 'ADMIN' ? 'admin' : 'dashboard'
  const href = profileHref ?? `/profile?${new URLSearchParams({ from, returnTo: currentPath }).toString()}`

  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
        <span className="text-indigo-600 text-xs font-semibold">{name.charAt(0).toUpperCase()}</span>
      </div>
      <span className="text-sm font-medium text-slate-700 hidden sm:block max-w-[150px] truncate">{name}</span>
    </Link>
  )
}
