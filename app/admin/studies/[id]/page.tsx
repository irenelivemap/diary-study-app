/**
 * Next.js page for admin/studies/[id].
 */
import { notFound } from 'next/navigation'
import ReminderSendCard from '@/app/components/ReminderSendCard'
import OverviewSection from '@/app/components/OverviewSection'
import { ButtonLink } from '@/app/components/ui'
import { phaseBadgeClass } from '@/app/lib/phase-colors'
import { loadStudyOverviewData } from '@/app/lib/study-overview-data'

export default async function StudyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const overview = await loadStudyOverviewData(id)
  if (!overview) notFound()
  const {
    study,
    includePilotEntries,
    entriesByDay,
    maxDayCount,
    entryCountByPart,
    funnel,
    recentEntries,
    readinessIssues,
    reminderDiagnostic,
    partNameById,
    participantEmailByUserId,
  } = overview
  return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <section className="mb-6 rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
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
            <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Response trend</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {includePilotEntries ? 'Pilot entries submitted over the last 7 days.' : 'Fieldwork entries submitted over the last 7 days.'}
                  </p>
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
            <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Parts</h2>
              <div className="mt-4 divide-y divide-slate-100">
                {study.parts.map((part, index) => (
                  <div key={part.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        <span className={`mr-2 rounded-md px-2 py-1 text-xs font-bold text-white ${phaseBadgeClass(index)}`}>PT {index + 1}</span>
                        {part.name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">{part.questions.length} questions</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-950">{entryCountByPart.get(part.id) ?? 0}</p>
                      <p className="text-xs text-slate-500">{includePilotEntries ? 'pilot entries' : 'entries'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
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
                diagnostic={reminderDiagnostic}
                recentLogs={study.reminderLogs.map((log) => ({
                  id: log.id,
                  status: log.status,
                  date: log.date,
                  partName: partNameById.get(log.partId) ?? 'Unknown part',
                  recipientEmail: participantEmailByUserId.get(log.userId) ?? 'Unknown participant',
                  sentAt: log.sentAt.toISOString(),
                  error: log.error,
                }))}
              />
            </OverviewSection>
          </div>
        </div>
      </main>
  )
}
