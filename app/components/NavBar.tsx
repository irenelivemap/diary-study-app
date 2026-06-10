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
    <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href={resolvedHomeHref}
          className="inline-flex h-10 items-center font-bold text-slate-950 text-base shrink-0 tracking-tight">
          diARI
        </Link>

        <div className="flex items-center gap-2 flex-1 justify-end overflow-x-auto">
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          {canSwitchModes && (
            <Link
              href={role === 'ADMIN' ? '/dashboard' : '/admin'}
              className="inline-flex h-9 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 whitespace-nowrap"
            >
              {role === 'ADMIN' ? 'Participant view' : 'Researcher view'}
            </Link>
          )}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-100 shrink-0">
            <ProfileNavLink name={name} role={role} profileHref={profileHref} />
            <form action={logout}>
              <button className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 whitespace-nowrap">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  )
}
