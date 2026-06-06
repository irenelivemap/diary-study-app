import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import AddParticipantForm from '@/app/components/AddParticipantForm'
import InviteLinkCard from '@/app/components/InviteLinkCard'
import NavBar from '@/app/components/NavBar'
import OverviewSection from '@/app/components/OverviewSection'
import ParticipantOpsForm from '@/app/components/ParticipantOpsForm'
import RemoveParticipantForm from '@/app/components/RemoveParticipantForm'
import StudyTabs from '@/app/components/StudyTabs'
import { Badge, ButtonLink } from '@/app/components/ui'
import { demographicFieldLabel } from '@/app/lib/demographics'

const PART_COLORS = ['bg-teal-500','bg-emerald-500','bg-green-700','bg-blue-500','bg-purple-500','bg-indigo-600']

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
        include: { _count: { select: { entries: true } } },
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

  const invitedEmails = [...new Set(study.invitations.map((invitation) => invitation.email.toLowerCase()))]
  const invitedUsers = invitedEmails.length
    ? await prisma.user.findMany({
        where: { email: { in: invitedEmails } },
        select: { id: true, email: true, lastLoginAt: true },
      })
    : []
  const invitedUsersByEmail = new Map(invitedUsers.map((user) => [user.email.toLowerCase(), user]))
  const invitedUserIds = invitedEmails
    .map((email) => invitedUsersByEmail.get(email)?.id)
    .filter((userId): userId is string => !!userId)
  const participantsWithEntries = new Set(
    Object.entries(entryCountMap)
      .filter(([, byPart]) => Object.values(byPart).some((count) => count > 0))
      .map(([userId]) => userId)
  )
  const activeParts = study.parts.filter((part) => part.isActive)
  const participantCompletedStudy = (userId: string) => {
    if (activeParts.length === 0) return false
    return activeParts.every((part) => {
      const count = entryCountMap[userId]?.[part.id] ?? 0
      return part.targetEntries && part.targetEntries > 0 ? count >= part.targetEntries : count > 0
    })
  }
  const funnel = {
    invited: invitedEmails.length,
    loggedIn: invitedEmails.filter((email) => !!invitedUsersByEmail.get(email)?.lastLoginAt).length,
    started: invitedUserIds.filter((userId) => participantsWithEntries.has(userId)).length,
    completed: invitedUserIds.filter(participantCompletedStudy).length,
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
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar name={session.name} role="ADMIN" canSwitchModes />
      <StudyTabs studyId={id} active="participants" studyName={study.name} isActive={study.isActive} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Recruitment funnel</h2>
              <p className="text-sm text-slate-500">Track invited participants from email invite to completed study.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-fr">
            {[
              { label: 'Invited', value: funnel.invited, detail: 'emails sent from this app' },
              { label: 'Logged in', value: funnel.loggedIn, detail: 'invited people with an account login' },
              { label: 'Started', value: funnel.started, detail: 'invited people with at least one entry' },
              { label: 'Completed', value: funnel.completed, detail: 'invited people who reached part targets' },
            ].map((item) => (
              <div key={item.label} className="flex h-full min-h-32 flex-col justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-600">{item.label}</p>
                  <p className="mt-2 text-3xl font-bold leading-none text-slate-950">{item.value}</p>
                </div>
                <p className="mt-3 text-sm leading-snug text-slate-500">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

          <div className="min-w-0 space-y-4">
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
                <div className="overflow-x-auto overscroll-x-contain">
                  <table className="w-full table-fixed text-sm" style={{ minWidth: `${Math.max(720, 555 + study.parts.length * 64)}px` }}>
                    <colgroup>
                      <col style={{ width: 270 }} />
                      <col style={{ width: 165 }} />
                      {study.parts.map((part) => <col key={part.id} style={{ width: 64 }} />)}
                      <col style={{ width: 64 }} />
                      <col style={{ width: 56 }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-5 py-3 text-left text-sm font-semibold text-slate-600">Name</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Status</th>
                        {study.parts.map((part, pi) => (
                          <th key={part.id} className="px-2 py-3 text-center text-sm font-semibold text-slate-600 whitespace-nowrap">
                            <span className={`text-xs font-bold text-white px-2 py-1 rounded-md ${PART_COLORS[pi % PART_COLORS.length]}`}>
                              PT {pi + 1}
                            </span>
                          </th>
                        ))}
                        <th className="px-2 py-3 text-center text-sm font-semibold text-slate-600 whitespace-nowrap">Total</th>
                        <th className="px-3 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
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
                                  <p className="text-xs text-slate-400 leading-tight truncate">{user.email}</p>
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
                            <td className="px-3 py-3 text-right align-middle">
                              <RemoveParticipantForm studyId={id} userId={user.id} participantName={user.name} />
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
                  <div key={participant.user.id} className="space-y-2">
                    <ParticipantOpsForm
                      studyId={id}
                      userId={participant.user.id}
                      name={participant.user.name}
                      email={participant.user.email}
                      notes={participant.researcherNotes}
                      incentiveStatus={participant.incentiveStatus}
                    />
                    {participant.externalParticipantId && (
                      <p className="px-1 text-xs text-slate-500">External ID: {participant.externalParticipantId}</p>
                    )}
                    {((participant.user.demographics && typeof participant.user.demographics === 'object') || (participant.demographics && typeof participant.demographics === 'object')) && (
                      <div className="flex flex-wrap gap-1 px-1">
                        {Object.entries({
                          ...(participant.demographics && typeof participant.demographics === 'object' ? participant.demographics as Record<string, unknown> : {}),
                          ...(participant.user.demographics && typeof participant.user.demographics === 'object' ? participant.user.demographics as Record<string, unknown> : {}),
                        }).map(([key, value]) => (
                          <span key={key} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                            {demographicFieldLabel(key)}: {String(value)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </OverviewSection>
          </div>

          <aside className="min-w-0 space-y-4 lg:sticky lg:top-4">
            <section className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">Invite participant</h2>
                <p className="text-sm text-slate-400 mt-0.5">Send an email invite. They can sign up after receiving it.</p>
              </div>
              <div className="p-5">
                <AddParticipantForm studyId={id} />
              </div>
            </section>

            {pendingInvitations.length > 0 && (
              <section className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-base font-semibold text-slate-800">Pending invitations</h2>
                  <p className="text-sm text-slate-400 mt-0.5">Invited but not signed up yet.</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {pendingInvitations.map((invitation) => (
                    <div key={invitation.id} className="px-5 py-3">
                      <p className="text-sm font-medium text-slate-800">{invitation.email}</p>
                      {invitation.externalParticipantId && (
                        <p className="text-xs text-slate-500">ID {invitation.externalParticipantId}</p>
                      )}
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
