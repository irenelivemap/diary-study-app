import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import { removeParticipant } from '@/app/actions/studies'
import AddParticipantForm from '@/app/components/AddParticipantForm'
import InviteLinkCard from '@/app/components/InviteLinkCard'
import NavBar from '@/app/components/NavBar'
import OverviewSection from '@/app/components/OverviewSection'
import ParticipantOpsForm from '@/app/components/ParticipantOpsForm'
import StudyTabs from '@/app/components/StudyTabs'
import { Badge, ButtonLink, IconButton, TrashIcon } from '@/app/components/ui'

const PART_COLORS = ['bg-teal-500','bg-emerald-500','bg-green-700','bg-blue-500','bg-purple-500','bg-indigo-600']

type ParticipantStatus = {
  label: 'Not started' | 'Recently active' | 'Quiet'
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
        include: { _count: { select: { entries: true } } },
      },
      participants: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      invitations: {
        where: { acceptedAt: null },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!study) notFound()

  const [entriesByPartAndUser, latestEntryByUser] = await Promise.all([
    prisma.entry.groupBy({
      by: ['partId', 'userId'],
      where: { studyId: id },
      _count: { id: true },
    }),
    prisma.entry.groupBy({
      by: ['userId'],
      where: { studyId: id },
      _max: { date: true },
    }),
  ])
  const latestEntryMap = new Map(latestEntryByUser.flatMap((row) => row._max.date ? [[row.userId, row._max.date] as const] : []))

  const entryCountMap: Record<string, Record<string, number>> = {}
  for (const row of entriesByPartAndUser) {
    if (!entryCountMap[row.userId]) entryCountMap[row.userId] = {}
    entryCountMap[row.userId][row.partId] = row._count.id
  }

  const totalEntries = Object.values(entryCountMap).reduce(
    (sum, byPart) => sum + Object.values(byPart).reduce((a, b) => a + b, 0),
    0
  )
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
      const daysSince = Math.floor((Date.now() - new Date(`${latestDate}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince >= 7) {
        return {
          label: 'Quiet',
          detail: `Last entry ${latestDate}`,
          tone: 'warning',
        }
      }
      return {
        label: 'Recently active',
        detail: `Last entry ${latestDate}`,
        tone: 'info',
      }
    }

    return {
      label: 'Recently active',
      detail: 'Has submitted at least one entry',
      tone: 'info',
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar name={session.name} role="ADMIN" />
      <StudyTabs studyId={id} active="participants" studyName={study.name} isActive={study.isActive} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
          <div className="space-y-4">
            <section className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">
                    Participant progress
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{study.participants.length}</span>
                  </h2>
                  <p className="text-sm text-slate-400 mt-0.5">Participant status and entry counts by part.</p>
                </div>
                <ButtonLink href={`/admin/studies/${id}/data`} tone="secondary" size="sm">
                  Open responses
                </ButtonLink>
              </div>

              {study.participants.length === 0 ? (
                <p className="text-sm text-slate-400 px-5 py-4">No participants yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[520px] w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3 min-w-[220px]">Name</th>
                        <th className="text-left text-sm font-semibold text-slate-600 px-3 py-3 min-w-[150px]">Status</th>
                        {study.parts.map((part, pi) => (
                          <th key={part.id} className="text-center text-sm font-semibold text-slate-600 px-3 py-3 whitespace-nowrap">
                            <span className={`text-xs font-bold text-white px-2 py-1 rounded-md ${PART_COLORS[pi % PART_COLORS.length]}`}>
                              PT {pi + 1}
                            </span>
                          </th>
                        ))}
                        <th className="text-center text-sm font-semibold text-slate-600 px-3 py-3 whitespace-nowrap">Total</th>
                        <th className="px-3 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {study.participants.map(({ user }) => {
                        const userCounts = entryCountMap[user.id] ?? {}
                        const total = Object.values(userCounts).reduce((a, b) => a + b, 0)
                        const status = participantStatus(user.id)
                        const participantHref = `/admin/studies/${id}/participants/${user.id}`
                        return (
                          <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-5 py-3">
                              <Link href={participantHref} className="flex items-center gap-2.5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                                  <span className="text-indigo-600 text-xs font-semibold">{user.name.charAt(0).toUpperCase()}</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-800 text-sm leading-tight truncate group-hover:text-indigo-700">{user.name}</p>
                                  <p className="text-xs text-slate-400 leading-tight truncate">{user.email}</p>
                                </div>
                              </Link>
                            </td>
                            <td className="px-3 py-3">
                              <Link href={participantHref} className="block space-y-1 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <Badge tone={status.tone}>{status.label}</Badge>
                                <p className="max-w-[180px] text-xs leading-snug text-slate-400">{status.detail}</p>
                              </Link>
                            </td>
                            {study.parts.map((part) => {
                              const count = userCounts[part.id] ?? 0
                              return (
                                <td key={part.id} className="px-3 py-3 text-center whitespace-nowrap">
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
                            <td className="px-3 py-3 text-center whitespace-nowrap">
                              <Link href={participantHref} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <span className={`font-bold text-sm ${total > 0 ? 'text-slate-800' : 'text-slate-200'}`}>
                                  {total || '—'}
                                </span>
                              </Link>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <form action={async () => { 'use server'; await removeParticipant(id, user.id) }}>
                                <IconButton type="submit" label={`Remove ${user.name}`} tone="trash" className="h-9 w-9">
                                  <TrashIcon />
                                </IconButton>
                              </form>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <OverviewSection
              title="Fieldwork operations"
              description="Optional notes and incentives."
              count={study.participants.length}
            >
              <div className="p-5 space-y-3">
                {study.participants.length === 0 ? (
                  <p className="text-sm text-slate-400">No participants yet.</p>
                ) : study.participants.map((participant) => (
                  <ParticipantOpsForm
                    key={participant.user.id}
                    studyId={id}
                    userId={participant.user.id}
                    name={participant.user.name}
                    email={participant.user.email}
                    notes={participant.researcherNotes}
                    incentiveStatus={participant.incentiveStatus}
                  />
                ))}
              </div>
            </OverviewSection>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4">
            <section className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">Invite participant</h2>
                <p className="text-sm text-slate-400 mt-0.5">Send an email invite. They can sign up after receiving it.</p>
              </div>
              <div className="p-5">
                <AddParticipantForm studyId={id} />
              </div>
            </section>

            {study.invitations.length > 0 && (
              <section className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-base font-semibold text-slate-800">Pending invitations</h2>
                  <p className="text-sm text-slate-400 mt-0.5">Invited but not signed up yet.</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {study.invitations.map((invitation) => (
                    <div key={invitation.id} className="px-5 py-3">
                      <p className="text-sm font-medium text-slate-800">{invitation.email}</p>
                      <p className="text-xs text-slate-400">
                        Sent {invitation.createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">Invite link</h2>
                <p className="text-sm text-slate-400 mt-0.5">Share this so participants can join after signing in.</p>
              </div>
              <InviteLinkCard studyId={id} initialToken={study.inviteToken} embedded />
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
