import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import NavBar from '@/app/components/NavBar'
import ConsentCard from '@/app/components/ConsentCard'
import { ButtonLink } from '@/app/components/ui'

const PART_COLORS = ['bg-teal-500','bg-emerald-500','bg-green-700','bg-blue-500','bg-purple-500','bg-indigo-600']

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { timezone: true } })
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: user?.timezone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  const participations = await prisma.studyParticipant.findMany({
    where: { userId: session.userId },
    include: {
      study: {
        include: {
          parts: {
            orderBy: { order: 'asc' },
            include: {
              entries: {
                where: { userId: session.userId },
                orderBy: { submittedAt: 'desc' },
                take: 7,
              },
              _count: { select: { questions: true } },
            },
          },
        },
      },
    },
  })

  function getDurationState(joinedAt: Date, durationDays: number | null) {
    if (!durationDays) return null
    const endDate = new Date(joinedAt)
    endDate.setDate(endDate.getDate() + durationDays)
    const todayDate = new Date(today)
    const daysLeft = Math.ceil((endDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
    return { endDate, daysLeft, ended: daysLeft <= 0 }
  }

  // A part is complete for sequential purposes when target entries are reached.
  // Duration is a time limit shown to participants but does NOT gate progression.
  function isPartComplete(part: { entries: unknown[]; targetEntries: number | null }) {
    if (part.targetEntries == null) return false // no target = never auto-completes
    return part.entries.length >= part.targetEntries
  }

  function isSequentialPartUnlocked(
    study: { sequential: boolean; parts: Array<{ id: string; unlockRule: string | null; unlockAt: Date | null; isActive: boolean; entries: unknown[]; targetEntries: number | null }> },
    index: number
  ) {
    if (!study.sequential || index === 0) return true
    const part = study.parts[index]
    const rule = part.unlockRule ?? 'AFTER_PREVIOUS_TARGET'
    if (rule === 'IMMEDIATE') return true
    if (rule === 'MANUAL') return part.isActive
    if (rule === 'DATE') return !!part.unlockAt && new Date(part.unlockAt) <= new Date()
    return study.parts.slice(0, index).every((prev) => isPartComplete(prev))
  }

  const pendingToday = participations.reduce((count, { study, joinedAt, consentedAt }) => {
    if (!consentedAt) return count
    const pending = study.parts.filter((p, pi) => {
      if (!p.isActive) return false
      if (p.entries.find((e) => e.date === today)) return false
      const dur = getDurationState(joinedAt, p.durationDays)
      if (dur?.ended) return false
      if (!isSequentialPartUnlocked(study, pi)) return false
      return true
    }).length
    return count + pending
  }, 0)

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar name={session.name} role="PARTICIPANT" />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            Good {greeting}, {session.name.split(' ')[0]}
          </h1>
          <p className="text-slate-500 mt-1">
            {pendingToday > 0
              ? `You have ${pendingToday} entr${pendingToday === 1 ? 'y' : 'ies'} to complete today.`
              : "You're all caught up for today."}
          </p>
        </div>

        {participations.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
            <h3 className="font-semibold text-slate-700 mb-1">No studies yet</h3>
            <p className="text-slate-400 text-sm">Your researcher will add you to a study. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {participations.map(({ study, joinedAt, consentedAt }) => (
              <div key={study.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 pt-5 pb-3 border-b border-slate-50">
                  <div className="flex items-start justify-between">
                    <h2 className="font-semibold text-slate-900">{study.name}</h2>
                    {!study.isActive && (
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </div>
                  {study.parts.length > 1 && (
                    <p className="text-xs text-slate-400 mt-1">{study.parts.length} parts</p>
                  )}
                </div>

                {!consentedAt ? (
                  <ConsentCard
                    studyId={study.id}
                    studyName={study.name}
                    description={study.description}
                    consentText={study.consentText}
                    contactEmail={study.contactEmail}
                  />
                ) : (
                <div className="divide-y divide-slate-50">
                  {study.parts.map((part, pi) => {
                    const todayEntry = part.entries.find((e) => e.date === today)
                    const pastEntries = part.entries.filter((e) => e.date !== today)
                    const isOverdue = part.dueDate && new Date(part.dueDate) < new Date()
                    const dur = getDurationState(joinedAt, part.durationDays)

                    // Sequential: locked if any previous part is not complete
                    const isLocked = !isSequentialPartUnlocked(study, pi)
                    const prevPartName = isLocked
                      ? study.parts.slice(0, pi).reverse().find((p) => !isPartComplete(p))?.name
                      : null

                    const entryCount = part.entries.length
                    const target = part.targetEntries
                    const goalReached = target != null && entryCount >= target
                    const progressPct = target ? Math.min((entryCount / target) * 100, 100) : null

                    if (isLocked) {
                      return (
                        <div key={part.id} className="px-6 py-4 opacity-60">
                          <div className="flex items-center gap-3">
                            <span className={`text-xs font-bold text-white px-1.5 py-0.5 rounded-md ${PART_COLORS[pi % PART_COLORS.length]}`}>
                              PT {pi + 1}
                            </span>
                            <span className="text-sm font-medium text-slate-500">{part.name}</span>
                            <span className="ml-auto text-xs text-slate-400 flex items-center gap-1">
                              🔒 {part.unlockRule === 'DATE' && part.unlockAt
                                ? `Unlocks ${new Date(part.unlockAt).toLocaleDateString()}`
                                : part.unlockRule === 'MANUAL'
                                ? 'Waiting for researcher'
                                : <>Complete <span className="font-medium text-slate-500">{prevPartName}</span> to unlock</>}
                            </span>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={part.id} className="px-6 py-5">
                        {/* Part label row */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold text-white px-1.5 py-0.5 rounded-md ${PART_COLORS[pi % PART_COLORS.length]}`}>
                              PT {pi + 1}
                            </span>
                            <span className="text-sm font-medium text-slate-800">{part.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isOverdue && <span className="text-xs font-medium bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Overdue</span>}
                            {part.dueDate && !isOverdue && (
                              <span className="text-xs font-medium bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">
                                Due {new Date(part.dueDate).toLocaleDateString()}
                              </span>
                            )}
                            {dur?.ended && (
                              <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                Duration ended
                              </span>
                            )}
                            {dur && !dur.ended && dur.daysLeft <= 3 && (
                              <span className="text-xs font-medium bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">
                                {dur.daysLeft} day{dur.daysLeft !== 1 ? 's' : ''} left
                              </span>
                            )}
                            {!part.isActive && <span className="text-xs text-slate-400">Inactive</span>}
                          </div>
                        </div>

                        {part.instructions && (
                          <p className="text-sm text-slate-500 mb-4 bg-slate-50 rounded-xl px-4 py-3 leading-relaxed">{part.instructions}</p>
                        )}

                        {/* Duration progress */}
                        {dur && (
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-medium text-slate-500">Duration</span>
                              <span className="text-xs font-semibold text-slate-700">
                                {dur.ended
                                  ? `Ended ${dur.endDate.toLocaleDateString()}`
                                  : dur.daysLeft === 1
                                  ? 'Last day today'
                                  : `${dur.daysLeft} days remaining`}
                              </span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${dur.ended ? 'bg-slate-300' : dur.daysLeft <= 3 ? 'bg-orange-400' : 'bg-indigo-400'}`}
                                style={{ width: `${Math.min(((part.durationDays! - Math.max(dur.daysLeft, 0)) / part.durationDays!) * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Entry progress bar */}
                        {target != null && (
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-medium text-slate-500">Progress</span>
                              <span className="text-xs font-semibold text-slate-700">
                                {entryCount} of {target} {entryCount === 1 ? 'entry' : 'entries'}
                                {goalReached && <span className="ml-1.5 text-emerald-600">· Goal reached!</span>}
                              </span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${goalReached ? 'bg-emerald-400' : 'bg-indigo-500'}`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                            {!goalReached && (
                              <p className="text-xs text-slate-400 mt-1">{target - entryCount} more to go</p>
                            )}
                          </div>
                        )}

                        {/* Today's entry CTA */}
                        {part.isActive && (
                          <div className="mb-2">
                            {dur?.ended ? (
                              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                                <div className="w-5 h-5 bg-slate-200 rounded-full flex items-center justify-center shrink-0">
                                  <span className="text-slate-500 text-xs">⏱</span>
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-slate-600">Duration complete</p>
                                  <p className="text-xs text-slate-400">
                                    This part ended on {dur.endDate.toLocaleDateString()}. No more entries can be submitted.
                                  </p>
                                </div>
                              </div>
                            ) : goalReached && !todayEntry ? (
                              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 bg-emerald-400 rounded-full flex items-center justify-center shrink-0">
                                    <span className="text-white text-xs font-bold">✓</span>
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-emerald-700">Goal reached</p>
                                    <p className="text-xs text-emerald-600">You've completed all {target} entries for this part.</p>
                                  </div>
                                </div>
                                <ButtonLink href={`/entry/new?studyId=${study.id}&partId=${part.id}`}
                                  tone="secondary"
                                  size="sm"
                                  className="shrink-0 ml-3">
                                  Add extra
                                </ButtonLink>
                              </div>
                            ) : todayEntry ? (
                              <div className="flex items-center justify-between bg-emerald-50 rounded-xl px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-4 h-4 bg-emerald-400 rounded-full flex items-center justify-center">
                                    <span className="text-white text-[9px]">✓</span>
                                  </div>
                                  <span className="text-xs font-medium text-emerald-700">Today's entry submitted</span>
                                </div>
                                <ButtonLink href={`/entry/${todayEntry.id}`} tone="secondary" size="sm">View</ButtonLink>
                              </div>
                            ) : (
                              <ButtonLink href={`/entry/new?studyId=${study.id}&partId=${part.id}`}
                                size="lg"
                                className="w-full h-auto min-h-16 justify-between px-4 py-3 group">
                                <div>
                                  <p className="text-sm font-semibold">Submit today's entry</p>
                                  <p className="text-xs text-indigo-200 mt-0.5">{today}</p>
                                </div>
                              </ButtonLink>
                            )}
                          </div>
                        )}

                        {pastEntries.length > 0 && (
                          <div className="mt-2 space-y-0.5">
                            {pastEntries.slice(0, 3).map((entry) => (
                              <Link key={entry.id} href={`/entry/${entry.id}`}
                                className="flex items-center justify-between py-1 rounded hover:bg-slate-50 -mx-1 px-1 transition-colors group">
                                <span className="text-xs text-slate-500">{entry.date}</span>
                                <span className="text-xs font-medium text-slate-400 group-hover:text-indigo-600">View</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
