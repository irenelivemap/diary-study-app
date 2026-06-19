/**
 * Admin profile section for inviting and removing admin access.
 */
import InviteAdminForm from '@/app/components/InviteAdminForm'
import RemoveAdminAccessForm from '@/app/components/RemoveAdminAccessForm'
import { Badge } from '@/app/components/ui'

type AdminUser = {
  id: string
  email: string
  name: string
  lastLoginAt: Date | null
  createdAt: Date
}

function formatDate(value: Date | null) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(value)
}

export default function TeamAccessSection({ admins, currentUserId }: {
  admins: AdminUser[]
  currentUserId: string
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Team access</h2>
          <p className="mt-1 text-sm text-slate-500">Admins can manage studies, participants, analysis, data, and team access.</p>
        </div>
        <Badge>{admins.length}</Badge>
      </div>
      <InviteAdminForm />
      <div className="divide-y divide-slate-100">
        {admins.map((admin) => (
          <div key={admin.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-slate-950">{admin.name}</p>
                {admin.id === currentUserId && <Badge tone="info">You</Badge>}
              </div>
              <p className="mt-1 truncate text-sm text-slate-500">{admin.email}</p>
            </div>
            <div className="flex flex-col gap-2 text-sm text-slate-500 sm:items-end sm:text-right">
              <div>
                <p>Last sign-in: {formatDate(admin.lastLoginAt)}</p>
                <p className="mt-1">Added: {formatDate(admin.createdAt)}</p>
              </div>
              {admin.id !== currentUserId && (
                <RemoveAdminAccessForm adminId={admin.id} adminName={admin.name} />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
