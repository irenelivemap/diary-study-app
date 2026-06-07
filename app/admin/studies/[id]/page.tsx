import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import NavBar from '@/app/components/NavBar'
import StudyTabs from '@/app/components/StudyTabs'
import ReminderSendCard from '@/app/components/ReminderSendCard'
import OverviewSection from '@/app/components/OverviewSection'
import { ButtonLink } from '@/app/components/ui'

const PART_COLORS = ['bg-teal-500','bg-emerald-500','bg-green-700','bg-blue-500','bg-purple-500','bg-indigo-600']

export default async function StudyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')

  const { id } = await params
  const study = await prisma.study.findUnique({
    where: { id },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: {
          questions: { orderBy: [{ page: 'asc' }, { order: 'asc' }] },
          _count: { select: { entries: true } },
        },
      },
      participants: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      invitations: {
        select: { email: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
      reminderLogs: {
        orderBy: { sentAt: 'desc' },
        take: 5,
      },
      _count: { select: { entries: true } },
      entries: {
        take: 6,
        include: {
          user: { select: { id: true, name: true, email: true } },
          part: { select: { id: true, name: true, order: true } },
        },
        orderBy: { submittedAt: 'desc' },
      },
    },
  })
  if (!study) notFound()

  const dayKeys = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    return date.toISOString().split('T')[0]
  })
  const invitedEmails = [...new Set(study.invitations.map((invitation) => invitation.email.toLowerCase()))]
  const [entriesByDayRaw, participantsWithEntriesRaw, entriesByParticipantPartRaw, invitedUsers] = await Promise.all([
    prisma.entry.groupBy({
      by: ['date'],
      where: { studyId: id, date: { in: dayKeys } },
      _count: { id: true },
    }),
    prisma.entry.groupBy({
      by: ['userId'],
      where: { studyId: id },
      _count: { id: true },
    }),
    prisma.entry.groupBy({
      by: ['userId', 'partId'],
      where: { studyId: id },
      _count: { id: true },
    }),
    invitedEmails.length
      ? prisma.user.findMany({
          where: { email: { in: invitedEmails } },
          select: { id: true, email: true, lastLoginAt: true },
        })
      : Promise.resolve([]),
  ])
  const dayCountMap = new Map(entriesByDayRaw.map((row) => [row.date, row._count.id]))
  const entriesByDay = dayKeys.map((date) => ({
    date,
    count: dayCountMap.get(date) ?? 0,
  }))
  const maxDayCount = Math.max(...entriesByDay.map((day) => day.count), 1)
  const participantsWithEntries = new Set(participantsWithEntriesRaw.map((entry) => entry.userId))
  const entryCountByParticipantPart = new Map(
    entriesByParticipantPartRaw.map((entry) => [`${entry.userId}:${entry.partId}`, entry._count.id])
  )
  const invitedUsersByEmail = new Map(invitedUsers.map((user) => [user.email.toLowerCase(), user]))
  const invitedUserIds = invitedEmails
    .map((email) => invitedUsersByEmail.get(email)?.id)
    .filter((userId): userId is string => !!userId)
  const activeParts = study.parts.filter((part) => part.isActive)
  const participantCompletedStudy = (userId: string) => {
    if (activeParts.length === 0) return false
    return activeParts.every((part) => {
      const count = entryCountByParticipantPart.get(`${userId}:${part.id}`) ?? 0
      return part.targetEntries && part.targetEntries > 0 ? count >= part.targetEntries : count > 0
    })
  }
  const funnel = {
    invited: invitedEmails.length,
    loggedIn: invitedEmails.filter((email) => !!invitedUsersByEmail.get(email)?.lastLoginAt).length,
    started: invitedUserIds.filter((userId) => participantsWithEntries.has(userId)).length,
    completed: invitedUserIds.filter(participantCompletedStudy).length,
  }
  const recentEntries = study.entries.slice(0, 6)
  const allQuestions = study.parts.flatMap((p) => p.questions.map((q) => ({ ...q, partName: p.name })))
  const readiness = [
    { label: 'Study is active', ok: study.isActive, fix: 'Turn on Study status in Setup.' },
    { label: 'At least one participant is enrolled', ok: study.participants.length > 0, fix: 'Add participants in the Participants tab.' },
    { label: 'At least one active part exists', ok: study.parts.some((p) => p.isActive), fix: 'Activate a part in Setup.' },
    { label: 'All questions have text', ok: allQuestions.every((q) => q.text.replace(/<[^>]*>/g, '').trim().length > 0), fix: 'Add text to every question in Setup.' },
    { label: 'Participant consent text is present', ok: !!study.consentText, fix: 'Add consent / intro text in Setup.' },
    { label: 'Researcher contact email is present', ok: !!study.contactEmail, fix: 'Add a contact email in Setup.' },
    { label: 'Reminder email settings are ready', ok: !study.remindersEnabled || !!study.reminderTime, fix: 'Review email reminder settings in Setup.' },
    { label: 'Entry target or duration is set for each part', ok: study.parts.every((p) => p.targetEntries || p.durationDays || p.dueDate), fix: 'Set target entries, duration, or due date for each part.' },
    {
      label: 'Conditional questions point to existing questions',
      ok: allQuestions.every((q) => !q.showIfQuestionId || allQuestions.some((source) => source.id === q.showIfQuestionId)),
      fix: 'Review conditional display rules in Setup.',
    },
  ]
  const readinessIssues = readiness.filter((item) => !item.ok)
  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar name={session.name} role="ADMIN" canSwitchModes />
      <StudyTabs studyId={id} active="overview" studyName={study.name} isActive={study.isActive} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <section className="mb-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4">
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

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Response trend</h2>
                  <p className="mt-0.5 text-sm text-slate-500">Entries submitted over the last 7 days.</p>
                </div>
              </div>
              <div className="flex h-48 items-end gap-2">
                {entriesByDay.map((day) => {
                  const height = Math.max((day.count / maxDayCount) * 100, day.count > 0 ? 12 : 4)
                  return (
                    <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                      <div className="flex h-36 w-full items-end rounded-xl bg-slate-50 px-1.5">
                        <div
                          className="w-full rounded-lg bg-indigo-500 transition-all"
                          style={{ height: `${height}%` }}
                          title={`${day.count} entries on ${day.date}`}
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-900">{day.count}</p>
                        <p className="text-[11px] text-slate-500">
                          {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Parts</h2>
              <div className="mt-4 divide-y divide-slate-100">
                {study.parts.map((part, index) => (
                  <div key={part.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        <span className={`mr-2 rounded-md px-2 py-1 text-xs font-bold text-white ${PART_COLORS[index % PART_COLORS.length]}`}>PT {index + 1}</span>
                        {part.name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">{part.questions.length} questions</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-950">{part._count.entries}</p>
                      <p className="text-xs text-slate-500">entries</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-slate-900">Recent entries</h2>
              </div>
              {recentEntries.length === 0 ? (
                <p className="text-sm text-slate-500">No entries yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentEntries.map((entry) => (
                    <div key={entry.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{entry.user.name}</p>
                          <p className="truncate text-sm text-slate-500">{entry.part.name} · {entry.date}</p>
                        </div>
                        <span className="shrink-0 text-xs text-slate-500">
                          {entry.submittedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className={`rounded-2xl border shadow-sm overflow-hidden ${readinessIssues.length ? 'bg-amber-50/70 border-amber-100' : 'bg-emerald-50/70 border-emerald-100'}`}>
            <div className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className={`text-sm font-semibold ${readinessIssues.length ? 'text-amber-900' : 'text-emerald-900'}`}>
                  {readinessIssues.length
                    ? `Launch readiness: ${readinessIssues.length} item${readinessIssues.length === 1 ? '' : 's'} need attention`
                    : 'This study has the essentials needed for participant fieldwork.'}
                </p>
                {readinessIssues.length > 0 && (
                  <p className="text-sm text-amber-700 mt-1">
                    {readinessIssues.map((issue) => issue.fix).join(' ')}
                  </p>
                )}
              </div>
              <ButtonLink href={`/admin/studies/${id}/edit`} tone="secondary" size="sm">
                Review setup
              </ButtonLink>
            </div>
          </div>

          <div className="space-y-4">
            <OverviewSection
              title="Email reminders"
              description={study.remindersEnabled ? `Enabled after ${study.reminderTime ?? '18:00'}.` : 'Optional reminder workflow.'}
              count={study.reminderLogs.length ? `${study.reminderLogs.length} recent` : undefined}
              tone="info"
            >
              <ReminderSendCard
                studyId={id}
                enabled={study.remindersEnabled}
                reminderTime={study.reminderTime ?? '18:00'}
                embedded
                recentLogs={study.reminderLogs.map((log) => ({
                  id: log.id,
                  status: log.status,
                  date: log.date,
                  sentAt: log.sentAt.toISOString(),
                  error: log.error,
                }))}
              />
            </OverviewSection>

          </div>
        </div>
      </main>
    </div>
  )
}
