import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import NavBar from '@/app/components/NavBar'
import ConsentCard from '@/app/components/ConsentCard'
import StartJourneyButton from '@/app/components/StartJourneyButton'
import { startJourney } from '@/app/actions/entries'
import { ButtonLink, EyeIcon } from '@/app/components/ui'
import { normalizeTimezone } from '@/app/lib/validation'

const PART_COLORS = ['bg-teal-500','bg-emerald-500','bg-green-700','bg-blue-500','bg-purple-500','bg-indigo-600']

function journeyArticle(name: string) {
  return /^[aeiou]/i.test(name.trim()) ? 'an' : 'a'
}

function pluralizeJourneyName(name: string) {
  const words = name.trim().split(/\s+/)
  const last = words.pop() ?? 'journey'
  const pluralLast = /[^aeiou]y$/i.test(last)
    ? `${last.slice(0, -1)}ies`
    : /(s|x|z|ch|sh)$/i.test(last)
    ? `${last}es`
    : `${last}s`
  return [...words, pluralLast].join(' ')
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { timezone: true } })
  const userTimezone = normalizeTimezone(user?.timezone)
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: userTimezone || undefined,
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
                take: 8,
              },
              _count: {
                select: {
                  questions: true,
                  entries: { where: { userId: session.userId } },
                },
              },
            },
          },
          journeys: {
            where: { userId: session.userId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: {
              entries: {
                orderBy: { submittedAt: 'asc' },
                select: { id: true, partId: true, submittedAt: true, date: true },
              },
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
  function isPartComplete(part: { entries: unknown[]; targetEntries: number | null; _count?: { entries: number } }) {
    if (part.targetEntries == null) return false // no target = never auto-completes
    return (part._count?.entries ?? part.entries.length) >= part.targetEntries
  }

  function statusText(part: { entryPolicy: string; targetEntries: number | null }, todayCount: number, entryCount: number, goalReached: boolean) {
    if (part.entryPolicy === 'MULTIPLE_PER_DAY') {
      if (todayCount > 0) return `${todayCount} submitted today`
      if (part.targetEntries && !goalReached) return 'Ready to submit today'
      return 'Ready when something happens'
    }
    if (todayCount > 0) return "Today's entry submitted"
    if (goalReached) return 'Completed'
    if (part.targetEntries) return `${Math.max(part.targetEntries - entryCount, 0)} left`
    return 'Ready to submit'
  }

  function isSequentialPartUnlocked(
    study: { sequential: boolean; parts: Array<{ id: string; unlockRule: string | null; unlockAt: Date | null; isActive: boolean; entries: unknown[]; targetEntries: number | null; _count?: { entries: number } }> },
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
    const hasJourneyStages = study.parts.some((part) => part.isActive && part.flow === 'JOURNEY_STAGE')
    const journeyPending = hasJourneyStages && study.journeys.some((journey) => !journey.completedAt) ? 1 : 0
    const pending = study.parts.filter((p, pi) => {
      if (p.flow === 'JOURNEY_STAGE') return false
      if (!p.isActive) return false
      if (isPartComplete(p)) return false
      if (p.entries.find((e) => e.date === today)) return false
      if (p.entryPolicy === 'MULTIPLE_PER_DAY' && !p.targetEntries) return false
      const dur = getDurationState(joinedAt, p.durationDays)
      if (dur?.ended) return false
      if (!isSequentialPartUnlocked(study, pi)) return false
      return true
    }).length
    return count + journeyPending + pending
  }, 0)

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar name={session.name} role="PARTICIPANT" canSwitchModes={session.role === 'ADMIN'} />

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
                <div className="space-y-3 p-4 sm:p-5">
                  {study.mode === 'JOURNEY' ? (() => {
                    const configuredJourneyName = study.journeyName?.trim()
                    const journeyName = configuredJourneyName && configuredJourneyName !== 'Journey' ? configuredJourneyName : 'journey'
                    const journeyNamePlural = pluralizeJourneyName(journeyName)
                    const activeParts = study.parts.filter((stage) => stage.isActive && stage.flow === 'JOURNEY_STAGE')
                    const independentParts = study.parts.filter((candidate) => candidate.flow !== 'JOURNEY_STAGE')
                    const openJourney = study.journeys.find((journey) => !journey.completedAt)
                    const otherOpenJourneys = study.journeys.filter((journey) => !journey.completedAt && journey.id !== openJourney?.id)
                    const completedJourneys = study.journeys.filter((journey) => journey.completedAt)
                    const canViewPastEntries = study.participantEntryAccess === 'SHOW_READ_ONLY'
                    const journeyNextStage = (journey: typeof study.journeys[number]) => {
                      const entriesByPart = new Map(journey.entries.map((entry) => [entry.partId, entry]))
                      return activeParts.find((stage) => !entriesByPart.has(stage.id))
                    }
                    const independentPartCards = independentParts.map((part) => {
                      const pi = study.parts.findIndex((candidate) => candidate.id === part.id)
                      const todayEntries = part.entries.filter((e) => e.date === today)
                      const todayEntry = todayEntries[0]
                      const pastEntries = part.entries.filter((e) => e.date !== today)
                      const isOverdue = part.dueDate && new Date(part.dueDate) < new Date()
                      const dur = getDurationState(joinedAt, part.durationDays)
                      const entryCount = part._count.entries
                      const target = part.targetEntries
                      const allowMultipleEntries = part.entryPolicy === 'MULTIPLE_PER_DAY'
                      const goalReached = target != null && entryCount >= target
                      const isClosed = !!dur?.ended || !!isOverdue || part.isActive === false
                      const canSubmit = part.isActive && !isClosed && (allowMultipleEntries || (!todayEntry && !goalReached))
                      const currentStatus = statusText(part, todayEntries.length, entryCount, goalReached)
                      const targetLabel = target ? `${entryCount}/${target} entries` : `${entryCount} submitted`
                      const timeLabel = isOverdue
                        ? 'Deadline passed'
                        : dur?.ended
                        ? `Ended ${dur.endDate.toLocaleDateString()}`
                        : dur
                        ? dur.daysLeft === 1
                          ? 'Last day today'
                          : `${dur.daysLeft} days left`
                        : part.dueDate
                        ? `Due ${new Date(part.dueDate).toLocaleDateString()}`
                        : null

                      return (
                        <div key={part.id} className={`rounded-2xl border p-4 sm:p-5 ${
                          canSubmit ? 'border-indigo-100 bg-indigo-50/50' : 'border-slate-100 bg-white'
                        }`}>
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold text-white px-1.5 py-0.5 rounded-md ${PART_COLORS[pi % PART_COLORS.length]}`}>
                                  PT {pi + 1}
                                </span>
                                <h3 className="text-base font-semibold text-slate-950">{part.name}</h3>
                              </div>
                              <p className={`mt-2 text-sm font-medium ${
                                canSubmit ? 'text-indigo-700' : todayEntry || goalReached ? 'text-emerald-700' : 'text-slate-600'
                              }`}>
                                {isClosed ? 'Closed' : currentStatus}
                              </p>
                              {part.instructions && (
                                <p className="mt-2 text-sm leading-relaxed text-slate-600">{part.instructions}</p>
                              )}
                            </div>
                            <div className="shrink-0">
                              {canSubmit ? (
                                <ButtonLink
                                  href={`/entry/new?studyId=${study.id}&partId=${part.id}`}
                                  size="md"
                                  className="w-full sm:w-auto"
                                >
                                  {allowMultipleEntries && todayEntries.length > 0 ? 'Add another entry' : 'Submit entry'}
                                </ButtonLink>
                              ) : todayEntry ? (
                                <ButtonLink href={`/entry/${todayEntry.id}`} tone="secondary" size="md" className="w-full sm:w-auto">
                                  View today&apos;s entry
                                </ButtonLink>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {allowMultipleEntries && (
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                                Multiple entries allowed
                              </span>
                            )}
                            {(target || entryCount > 0) && (
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                                {targetLabel}
                              </span>
                            )}
                            {timeLabel && (
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                                isOverdue || dur?.ended
                                  ? 'bg-slate-100 text-slate-600 ring-slate-200'
                                  : dur && dur.daysLeft <= 3
                                  ? 'bg-orange-50 text-orange-700 ring-orange-100'
                                  : 'bg-white text-slate-700 ring-slate-200'
                              }`}>
                                {timeLabel}
                              </span>
                            )}
                            {goalReached && (
                              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                                Target reached
                              </span>
                            )}
                          </div>

                          {canViewPastEntries && pastEntries.length > 0 && (
                            <details className="mt-4 rounded-xl border border-slate-100 bg-white">
                              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700">
                                Previous entries
                                <span className="ml-2 text-sm font-normal text-slate-400">{pastEntries.length}</span>
                              </summary>
                              <div className="border-t border-slate-100 px-4 py-2">
                                {pastEntries.slice(0, 5).map((entry) => (
                                  <Link key={entry.id} href={`/entry/${entry.id}`}
                                    className="flex items-center justify-between rounded-lg py-2 text-sm hover:bg-slate-50">
                                    <span className="text-slate-600">{entry.date}</span>
                                    <span className="font-medium text-indigo-600">View</span>
                                  </Link>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )
                    })

                    if (activeParts.length === 0) return independentPartCards

                    if (!openJourney) {
                      return (
                        <>
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5">
                          <p className="text-sm font-semibold text-indigo-700">Next action</p>
                          <h3 className="mt-1 text-xl font-bold text-slate-950">Start {journeyArticle(journeyName)} {journeyName}</h3>
                          <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            Start one when the real experience begins. diARI will guide you through each stage.
                          </p>
                          <form action={startJourney} className="mt-4">
                            <input type="hidden" name="studyId" value={study.id} />
                            <input type="hidden" name="forceNewJourney" value="true" />
                            <StartJourneyButton className="w-full sm:w-auto">
                              Start {journeyArticle(journeyName)} {journeyName}
                            </StartJourneyButton>
                          </form>
                          {completedJourneys.length > 0 && (
                            <details className="mt-4 rounded-xl border border-slate-100 bg-white">
                              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700">
                                Previous {journeyNamePlural}
                                <span className="ml-2 text-sm font-normal text-slate-400">{completedJourneys.length}</span>
                              </summary>
                              <div className="border-t border-slate-100 px-4 py-2">
                                {completedJourneys.slice(0, 3).map((journey) => (
                                  <div key={journey.id} className="py-2 text-sm text-slate-600">
                                    {journey.label ?? journeyName}
                                    {journey.completedAt && (
                                      <span className="ml-2 text-slate-400">{journey.completedAt.toLocaleDateString()}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                        {independentPartCards}
                        </>
                      )
                    }

                    const entriesByPart = new Map(openJourney.entries.map((entry) => [entry.partId, entry]))
                    const nextStage = activeParts.find((stage) => !entriesByPart.has(stage.id))
                    const completedCount = activeParts.filter((stage) => entriesByPart.has(stage.id)).length
                    const strictJourneyOrder = study.sequential
                    const previousJourneyCount = otherOpenJourneys.length + completedJourneys.length

                    return (
                      <>
                      <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{openJourney.label ?? journeyName}</p>
                            <p className="mt-0.5 text-sm text-slate-500">{completedCount}/{activeParts.length} stages submitted</p>
                          </div>
                          {!nextStage && (
                            <form action={startJourney} className="shrink-0">
                              <input type="hidden" name="studyId" value={study.id} />
                              <input type="hidden" name="forceNewJourney" value="true" />
                              <StartJourneyButton className="w-full sm:w-auto">
                                Start another
                              </StartJourneyButton>
                            </form>
                          )}
                        </div>

                        <div className="space-y-2">
                          {activeParts.map((stage, index) => {
                            const entry = entriesByPart.get(stage.id)
                            const isRecommended = nextStage?.id === stage.id
                            const isLocked = strictJourneyOrder && !entry && !isRecommended
                            const canAnswerStage = !entry && !isLocked
                            return (
                              <div key={stage.id} className={`rounded-xl border px-4 py-3 ${
                                entry
                                  ? 'border-slate-200 bg-white'
                                  : isRecommended
                                  ? 'border-indigo-200 bg-indigo-50'
                                  : !isLocked
                                  ? 'border-slate-200 bg-white'
                                  : 'border-slate-100 bg-slate-50'
                              }`}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="mb-1 flex flex-wrap items-center gap-2">
                                      {entry && (
                                        <>
                                          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                                            Submitted
                                          </span>
                                          <span className="text-xs font-medium text-slate-500">
                                            {entry.submittedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        </>
                                      )}
                                      {isRecommended && (
                                        <span className="inline-flex rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white">
                                          Recommended next
                                        </span>
                                      )}
                                    </div>
                                    <p className={`text-sm font-semibold ${isLocked ? 'text-slate-500' : 'text-slate-900'}`}>
                                      {isLocked ? 'Locked: ' : ''}
                                      {stage.name}
                                    </p>
                                    {!entry && (
                                      <p className="mt-0.5 text-sm text-slate-500">
                                        {isRecommended
                                          ? (stage.instructions || 'Answer this when this moment applies.')
                                          : !isLocked
                                          ? 'Available if needed'
                                          : `Available after ${activeParts[index - 1]?.name ?? 'the previous stage'}`}
                                      </p>
                                    )}
                                  </div>
                                  <div className="shrink-0">
                                    {entry && canViewPastEntries && (
                                      <Link
                                        href={`/entry/${entry.id}`}
                                        aria-label={`View ${stage.name}`}
                                        title={`View ${stage.name}`}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                                      >
                                        <EyeIcon />
                                      </Link>
                                    )}
                                    {canAnswerStage && (
                                      <ButtonLink
                                        href={`/entry/new?studyId=${study.id}&partId=${stage.id}&journeyId=${openJourney.id}`}
                                        tone={isRecommended ? 'primary' : 'secondary'}
                                        size="sm"
                                      >
                                        Answer now
                                      </ButtonLink>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {completedCount > 0 && nextStage && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">Different {journeyName}?</p>
                              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                Use this when the current one is not the experience you want to answer about.
                              </p>
                            </div>
                            <form action={startJourney} className="shrink-0">
                              <input type="hidden" name="studyId" value={study.id} />
                              <input type="hidden" name="forceNewJourney" value="true" />
                              <StartJourneyButton tone="secondary" size="md" className="w-full border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100 sm:w-auto">
                                Start another
                              </StartJourneyButton>
                            </form>
                          </div>
                        </div>
                      )}

                      {previousJourneyCount > 0 && (
                        <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-800">
                            Previous {journeyNamePlural}
                            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-600">{previousJourneyCount}</span>
                          </summary>
                          <div className="space-y-2 border-t border-slate-100 px-5 py-4">
                            {otherOpenJourneys.slice(0, 4).map((journey) => {
                              const nextOtherStage = journeyNextStage(journey)
                              return (
                                <div key={journey.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="truncate font-medium text-slate-800">{journey.label ?? journeyName}</p>
                                      {nextOtherStage && (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Needs action</span>
                                      )}
                                    </div>
                                    <p className="text-slate-600">{nextOtherStage ? `Next: ${nextOtherStage.name}` : 'All stages submitted'}</p>
                                  </div>
                                  {nextOtherStage && (
                                    <ButtonLink
                                      href={`/entry/new?studyId=${study.id}&partId=${nextOtherStage.id}&journeyId=${journey.id}`}
                                      tone="secondary"
                                      size="sm"
                                    >
                                      Continue
                                    </ButtonLink>
                                  )}
                                </div>
                              )
                            })}
                            {completedJourneys.slice(0, 4).map((journey) => (
                              <div key={journey.id} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate font-medium text-slate-800">{journey.label ?? journeyName}</p>
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Completed</span>
                                  </div>
                                  <p className="text-slate-600">
                                    {journey.completedAt ? journey.completedAt.toLocaleDateString() : 'All stages submitted'}
                                  </p>
                                </div>
                                {canViewPastEntries && (
                                  <Link
                                    href={`/journey/${journey.id}`}
                                    aria-label={`View ${journey.label ?? journeyName}`}
                                    title={`View ${journey.label ?? journeyName}`}
                                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700 transition-colors hover:bg-emerald-50"
                                  >
                                    <EyeIcon />
                                  </Link>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {independentPartCards}
                      </>
                    )
                  })() : study.parts.map((part, pi) => {
                    const todayEntries = part.entries.filter((e) => e.date === today)
                    const todayEntry = todayEntries[0]
                    const pastEntries = part.entries.filter((e) => e.date !== today)
                    const canViewPastEntries = study.participantEntryAccess === 'SHOW_READ_ONLY'
                    const isOverdue = part.dueDate && new Date(part.dueDate) < new Date()
                    const dur = getDurationState(joinedAt, part.durationDays)
                    const entryCount = part._count.entries
                    const target = part.targetEntries
                    const allowMultipleEntries = part.entryPolicy === 'MULTIPLE_PER_DAY'
                    const goalReached = target != null && entryCount >= target
                    const isClosed = !!dur?.ended || !!isOverdue || part.isActive === false
                    const canSubmit = part.isActive && !isClosed && (allowMultipleEntries || (!todayEntry && !goalReached))
                    const currentStatus = statusText(part, todayEntries.length, entryCount, goalReached)
                    const targetLabel = target ? `${entryCount}/${target} entries` : `${entryCount} submitted`
                    const timeLabel = isOverdue
                      ? 'Deadline passed'
                      : dur?.ended
                      ? `Ended ${dur.endDate.toLocaleDateString()}`
                      : dur
                      ? dur.daysLeft === 1
                        ? 'Last day today'
                        : `${dur.daysLeft} days left`
                      : part.dueDate
                      ? `Due ${new Date(part.dueDate).toLocaleDateString()}`
                      : null

                    // Sequential: locked if any previous part is not complete
                    const isLocked = !isSequentialPartUnlocked(study, pi)
                    const prevPartName = isLocked
                      ? study.parts.slice(0, pi).reverse().find((p) => !isPartComplete(p))?.name
                      : null

                    if (isLocked) {
                      return (
                        <div key={part.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 opacity-75">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`text-xs font-bold text-white px-1.5 py-0.5 rounded-md ${PART_COLORS[pi % PART_COLORS.length]}`}>
                              PT {pi + 1}
                              </span>
                              <span className="text-sm font-semibold text-slate-700">{part.name}</span>
                            </div>
                            <span className="text-sm text-slate-500">
                              {part.unlockRule === 'DATE' && part.unlockAt
                                ? `Unlocks ${new Date(part.unlockAt).toLocaleDateString()}`
                                : part.unlockRule === 'MANUAL'
                                ? 'Waiting for researcher'
                                : <>Complete <span className="font-medium text-slate-700">{prevPartName}</span> to unlock</>}
                            </span>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={part.id} className={`rounded-2xl border p-4 sm:p-5 ${
                        canSubmit ? 'border-indigo-100 bg-indigo-50/50' : 'border-slate-100 bg-white'
                      }`}>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold text-white px-1.5 py-0.5 rounded-md ${PART_COLORS[pi % PART_COLORS.length]}`}>
                              PT {pi + 1}
                            </span>
                              <h3 className="text-base font-semibold text-slate-950">{part.name}</h3>
                            </div>
                            <p className={`mt-2 text-sm font-medium ${
                              canSubmit ? 'text-indigo-700' : todayEntry || goalReached ? 'text-emerald-700' : 'text-slate-600'
                            }`}>
                              {isClosed ? 'Closed' : currentStatus}
                            </p>
                            {part.instructions && (
                              <p className="mt-2 text-sm leading-relaxed text-slate-600">{part.instructions}</p>
                            )}
                          </div>
                          <div className="shrink-0">
                            {canSubmit ? (
                              <ButtonLink
                                href={`/entry/new?studyId=${study.id}&partId=${part.id}`}
                                size="md"
                                className="w-full sm:w-auto"
                              >
                                {allowMultipleEntries && todayEntries.length > 0 ? 'Add another entry' : 'Submit entry'}
                              </ButtonLink>
                            ) : todayEntry ? (
                              <ButtonLink href={`/entry/${todayEntry.id}`} tone="secondary" size="md" className="w-full sm:w-auto">
                                View today&apos;s entry
                              </ButtonLink>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {allowMultipleEntries && (
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                              Multiple entries allowed
                            </span>
                          )}
                          {(target || entryCount > 0) && (
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                              {targetLabel}
                            </span>
                          )}
                          {timeLabel && (
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                              isOverdue || dur?.ended
                                ? 'bg-slate-100 text-slate-600 ring-slate-200'
                                : dur && dur.daysLeft <= 3
                                ? 'bg-orange-50 text-orange-700 ring-orange-100'
                                : 'bg-white text-slate-700 ring-slate-200'
                            }`}>
                              {timeLabel}
                            </span>
                          )}
                          {goalReached && (
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                              Target reached
                            </span>
                          )}
                        </div>

                        {canViewPastEntries && pastEntries.length > 0 && (
                          <details className="mt-4 rounded-xl border border-slate-100 bg-white">
                            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700">
                              Previous entries
                              <span className="ml-2 text-sm font-normal text-slate-400">{pastEntries.length}</span>
                            </summary>
                            <div className="border-t border-slate-100 px-4 py-2">
                              {pastEntries.slice(0, 5).map((entry) => (
                                <Link key={entry.id} href={`/entry/${entry.id}`}
                                  className="flex items-center justify-between rounded-lg py-2 text-sm hover:bg-slate-50">
                                  <span className="text-slate-600">{entry.date}</span>
                                  <span className="font-medium text-indigo-600">View</span>
                                </Link>
                              ))}
                            </div>
                          </details>
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
