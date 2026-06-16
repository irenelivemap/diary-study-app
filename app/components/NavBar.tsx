import Link from 'next/link'
import { logout } from '@/app/actions/auth'
import ProfileNavLink from '@/app/components/ProfileNavLink'

type Props = {
  name: string
  role: 'ADMIN' | 'PARTICIPANT'
  actions?: React.ReactNode
  homeHref?: string
  profileHref?: string
  canSwitchModes?: boolean
}

export default function NavBar({ name, role, actions, homeHref, profileHref, canSwitchModes = false }: Props) {
  const resolvedHomeHref = homeHref ?? (role === 'ADMIN' ? '/admin' : '/dashboard')

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-surface)_92%,transparent)] backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href={resolvedHomeHref}
          className="inline-flex h-10 items-center gap-2 shrink-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs font-bold tracking-tight">d</span>
          <span className="font-bold text-slate-950 text-base tracking-tight">diARI</span>
        </Link>

        <div className="scrollbar-hidden flex flex-1 items-center justify-end gap-2 overflow-x-auto">
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          {canSwitchModes && (
            <Link
              href={role === 'ADMIN' ? '/dashboard' : '/admin'}
              className="interactive-press inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)] whitespace-nowrap"
            >
              {role === 'ADMIN' ? 'Participant view' : 'Researcher view'}
            </Link>
          )}
          <div className="flex items-center gap-2 pl-3 border-l border-[var(--border-subtle)] shrink-0">
            <ProfileNavLink name={name} role={role} profileHref={profileHref} />
            <form action={logout}>
              <button className="interactive-press inline-flex min-h-[44px] items-center rounded-xl px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-slate-100 hover:text-slate-950 whitespace-nowrap">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  )
}
