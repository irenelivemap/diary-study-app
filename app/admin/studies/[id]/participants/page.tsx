import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import { appBaseUrl } from '@/app/lib/email'
import AddParticipantForm from '@/app/components/AddParticipantForm'
import InviteLinkCard from '@/app/components/InviteLinkCard'
import NavBar from '@/app/components/NavBar'
import RemoveParticipantForm from '@/app/components/RemoveParticipantForm'
import StudyTabs from '@/app/components/StudyTabs'
import { Badge, ButtonLink } from '@/app/components/ui'
import { phaseBadgeClass } from '@/app/lib/phase-colors'

type ParticipantStatus = {
  label: 'Not started' | 'Active' | 'Quiet'
  detail: string
  tone: 'neutral' | 'info' | 'warning'
}

export default async function StudyParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')

  const { id } = await params
  const study = await prisma.study.findUnique({
    where: { id },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: { _count: { select: { entries: { where: { isPilot: false } } } } },
      },
      participants: {
        include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true, demographics: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      invitations: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!study) notFound()

  const includePilotEntries = study.status === 'PREPARATION'
  const [entriesByPartAndUser, latestEntryByUser] = await Promise.all([
    prisma.entry.groupBy({
      by: ['partId', 'userId'],
      where: { studyId: id, ...(includePilotEntries ? {} : { isPilot: false }) },
      _count: { id: true },
    }),
    prisma.entry.groupBy({
      by: ['userId'],
      where: { studyId: id, ...(includePilotEntries ? {} : { isPilot: false }) },
      _max: { date: true },
    }),
  ])
  const latestEntryMap = new Map(latestEntryByUser.flatMap((row) => row._max.date ? [[row.userId, row._max.date] as const] : []))

  const entryCountMap: Record<string, Record<string, number>> = {}
  for (const row of entriesByPartAndUser) {
    if (!entryCountMap[row.userId]) entryCountMap[row.userId] = {}
    entryCountMap[row.userId][row.partId] = row._count.id
  }

  const pendingInvitations = study.invitations.filter((invitation) => !invitation.acceptedAt)
  const nowTime = new Date().getTime()

  function participantStatus(userId: string): ParticipantStatus {
    const userCounts = entryCountMap[userId] ?? {}
    const total = Object.values(userCounts).reduce((a, b) => a + b, 0)
    const latestDate = latestEntryMap.get(userId)

    if (total === 0) {
      return {
        label: 'Not started',
        detail: 'No entries yet',
        tone: 'neutral',
      }
    }

    if (latestDate) {
      const daysSince = Math.floor((nowTime - new Date(`${latestDate}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24))
      const formattedLatestDate = new Date(`${latestDate}T00:00:00`).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
      if (daysSince >= 7) {
        return {
          label: 'Quiet',
          detail: `Last entry ${formattedLatestDate}`,
          tone: 'warning',
        }
      }
      return {
        label: 'Active',
        detail: `Last entry ${formattedLatestDate}`,
        tone: 'info',
      }
    }

    return {
      label: 'Active',
      detail: 'Has submitted at least one entry',
      tone: 'info',
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <NavBar name={session.name} role="ADMIN" canSwitchModes />
      <StudyTabs studyId={id} active="participants" studyName={study.name} isActive={study.isActive} status={study.status} />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_256px]">
          <div className="min-w-0 space-y-4">
            <section className="w-full bg-white rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">
                    Participant progress
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{study.participants.length}</span>
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {includePilotEntries ? 'Pilot entry counts by part while the study is in preparation.' : 'Participant status and fieldwork entry counts by part.'}
                  </p>
                </div>
                <ButtonLink href={`/admin/studies/${id}/data`} tone="secondary" size="sm">
                  Open responses
                </ButtonLink>
              </div>

              {study.participants.length === 0 ? (
                <p className="text-sm text-slate-500 px-5 py-4">No participants yet.</p>
              ) : (
                <div className="overflow-x-auto overscroll-x-contain">
                  <table className="w-full table-fixed text-sm" style={{ minWidth: `${480 + study.parts.length * 60}px` }}>
                    <colgroup>
                      <col style={{ width: 220 }} />
                      <col style={{ width: 150 }} />
                      {study.parts.map((part) => <col key={part.id} style={{ width: 60 }} />)}
                      <col style={{ width: 56 }} />
                      <col style={{ width: 54 }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)]">
                        <th className="px-5 py-3 text-left text-sm font-semibold text-slate-600">Name</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Status</th>
                        {study.parts.map((part, pi) => (
                          <th key={part.id} className="px-2 py-3 text-center text-sm font-semibold text-slate-600 whitespace-nowrap">
                            <span className={`text-xs font-bold text-white px-2 py-1 rounded-md ${phaseBadgeClass(pi)}`}>
                              PT {pi + 1}
                            </span>
                          </th>
                        ))}
                        <th className="px-2 py-3 text-center text-sm font-semibold text-slate-600 whitespace-nowrap">Total</th>
                        <th className="sticky right-0 bg-white px-3 py-3" style={{ boxShadow: '-1px 0 0 0 var(--border-subtle)' }} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {study.participants.map((participant) => {
                        const { user } = participant
                        const userCounts = entryCountMap[user.id] ?? {}
                        const total = Object.values(userCounts).reduce((a, b) => a + b, 0)
                        const status = participantStatus(user.id)
                        const participantHref = `/admin/studies/${id}/participants/${user.id}`
                        return (
                          <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-5 py-3 align-middle">
                              <Link href={participantHref} className="flex items-center gap-2.5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                                  <span className="text-indigo-600 text-xs font-semibold">{user.name.charAt(0).toUpperCase()}</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-800 text-sm leading-tight truncate group-hover:text-indigo-700">{user.name}</p>
                                  <p className="text-xs text-slate-500 leading-tight truncate">{user.email}</p>
                                  {participant?.externalParticipantId && (
                                    <p className="text-xs text-slate-500 leading-tight truncate">ID {participant.externalParticipantId}</p>
                                  )}
                                </div>
                              </Link>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <Link href={participantHref} className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <Badge tone={status.tone} className="whitespace-nowrap">{status.label}</Badge>
                                <p className="mt-1 text-xs leading-snug text-slate-500 whitespace-nowrap">{status.detail}</p>
                              </Link>
                            </td>
                            {study.parts.map((part) => {
                              const count = userCounts[part.id] ?? 0
                              return (
                                <td key={part.id} className="px-2 py-3 text-center align-middle whitespace-nowrap">
                                  <Link href={participantHref} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                    {count > 0 ? (
                                      <span className="font-semibold text-slate-700">{count}</span>
                                    ) : (
                                      <span className="text-slate-200">—</span>
                                    )}
                                  </Link>
                                </td>
                              )
                            })}
                            <td className="px-2 py-3 text-center align-middle whitespace-nowrap">
                              <Link href={participantHref} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <span className={`font-bold text-sm ${total > 0 ? 'text-slate-800' : 'text-slate-200'}`}>
                                  {total || '—'}
                                </span>
                              </Link>
                            </td>
                            <td className="sticky right-0 bg-white px-3 py-3 text-right align-middle group-hover:bg-slate-50" style={{ boxShadow: '-1px 0 0 0 var(--border-subtle)' }}>
                              <div className="opacity-40 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                <RemoveParticipantForm studyId={id} userId={user.id} participantName={user.name} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <aside className="min-w-0 space-y-4 lg:sticky lg:top-4">
            <section className="rounded-2xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                <h2 className="text-sm font-semibold text-slate-800">Invite participant</h2>
              </div>
              <div className="p-4">
                <AddParticipantForm studyId={id} />
              </div>
            </section>

            {pendingInvitations.length > 0 && (
              <section className="rounded-2xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                  <h2 className="text-sm font-semibold text-slate-800">Pending invitations</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {pendingInvitations.map((invitation) => (
                    <div key={invitation.id} className="px-5 py-3">
                      <p className="text-sm font-medium text-slate-800">{invitation.email}</p>
                      {invitation.externalParticipantId && (
                        <p className="text-xs text-slate-500">ID {invitation.externalParticipantId}</p>
                      )}
                      <p className="text-xs text-slate-500">
                        Sent {invitation.createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                <h2 className="text-sm font-semibold text-slate-800">Invite link</h2>
              </div>
              <InviteLinkCard studyId={id} initialToken={study.inviteToken} baseUrl={appBaseUrl()} embedded />
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
