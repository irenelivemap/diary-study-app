import Link from 'next/link'
import { logout } from '@/app/actions/auth'

type Props = {
  name: string
  role: 'ADMIN' | 'PARTICIPANT'
  actions?: React.ReactNode
}

export default function NavBar({ name, role, actions }: Props) {
  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Link href={role === 'ADMIN' ? '/admin' : '/dashboard'}
          className="font-semibold text-slate-900 text-sm shrink-0">
          diARI
        </Link>

        {/* Actions — scrollable on mobile if needed */}
        <div className="flex items-center gap-2 flex-1 justify-end overflow-x-auto">
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-100 shrink-0">
            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
              <span className="text-indigo-600 text-xs font-semibold">{name.charAt(0).toUpperCase()}</span>
            </div>
            <span className="text-sm text-slate-600 hidden sm:block max-w-[120px] truncate">{name}</span>
            <form action={logout}>
              <button className="text-xs text-slate-400 hover:text-slate-700 transition-colors whitespace-nowrap">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  )
}
