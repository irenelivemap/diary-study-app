import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import NavBar from '@/app/components/NavBar'
import ConsentCard from '@/app/components/ConsentCard'
import StartJourneyButton from '@/app/components/StartJourneyButton'
import { startJourney } from '@/app/actions/entries'
import { ButtonLink, ChevronDownIcon, EyeIcon } from '@/app/components/ui'
import { phaseBadgeClass } from '@/app/lib/phase-colors'
import {
  activeJourneyStages,
  journeyArticle,
  pluralizeJourneyName,
  resolveJourneyNextStage,
  resolveJourneyStageParticipantAction,
  resolveStandardParticipantAction,
  splitParticipantJourneys,
} from '@/app/lib/participant-actions'
import { loadParticipantDashboardData } from '@/app/lib/participant-dashboard-data'
import { resolveStudyStatus } from '@/app/lib/study-lifecycle'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const { greeting, participations, readyActionCount, today } = await loadParticipantDashboardData(session.userId)

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <NavBar name={session.name} role="PARTICIPANT" canSwitchModes={session.role === 'ADMIN'} />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Good {greeting}, {session.name.split(' ')[0]}
          </h1>
          <p className={`mt-1.5 text-sm font-medium ${readyActionCount > 0 ? 'text-indigo-600' : 'text-[var(--text-muted)]'}`}>
            {readyActionCount > 0
              ? `${readyActionCount} thing${readyActionCount === 1 ? '' : 's'} to answer`
              : "You're all caught up"}
          </p>
        </div>

        {participations.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-[#DDD9D2] p-12 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-700 mb-1">No studies yet</h3>
            <p className="text-slate-500 text-sm">Your researcher will add you to a study. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {participations.map(({ study, joinedAt, consentedAt }) => {
              const journeyStageCount = study.parts.filter((part) => part.isActive && part.flow === 'JOURNEY_STAGE').length
              const partCountLabel = study.mode === 'JOURNEY'
                ? `${journeyStageCount || study.parts.length} stages`
                : `${study.parts.length} parts`
              const studyStatus = resolveStudyStatus(study)
              return (
              <div key={study.id} className="bg-white rounded-2xl border border-[#E6E3DD] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-subtle)] sm:px-6">
                  <div className="flex items-start justify-between">
                    <h2 className="font-semibold text-slate-900">{study.name}</h2>
                    {studyStatus === 'CLOSED' && (
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Closed</span>
                    )}
                  </div>
                  {study.parts.length > 1 && (
                    <p className="text-xs text-slate-500 mt-1">{partCountLabel}</p>
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
                <div className="space-y-3 p-5 sm:p-6">
                  {study.mode === 'JOURNEY' ? (() => {
                    const configuredJourneyName = study.journeyName?.trim()
                    const journeyName = configuredJourneyName && configuredJourneyName !== 'Journey' ? configuredJourneyName : 'journey'
                    const journeyNamePlural = pluralizeJourneyName(journeyName)
                    const activeParts = activeJourneyStages(study)
                    const independentParts = study.parts.filter((candidate) => candidate.flow !== 'JOURNEY_STAGE')
                    const { completedJourneys, openJourney, previousJourneys, startedOtherOpenJourneys } = splitParticipantJourneys(study)
                    const canViewPastEntries = study.participantEntryAccess === 'SHOW_READ_ONLY'
                    const stagePreview = (
                      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stages</p>
                        <div className="mt-3 space-y-2">
                          {activeParts.map((stage, index) => (
                            <div key={stage.id} className="flex items-center gap-3 text-sm">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                                {index + 1}
                              </span>
                              <span className="font-medium text-slate-800">{stage.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )

                    const previousJourneyList = previousJourneys.length > 0 ? (
                      <details className="group rounded-2xl border border-[var(--border)] bg-white shadow-sm">
                        <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-slate-700">
                          <span className="flex items-center gap-2">
                            <ChevronDownIcon className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
                            Previous {journeyNamePlural}
                            <span className="rounded-full bg-[var(--bg-sunken)] px-2 py-0.5 text-xs font-semibold text-slate-500">{previousJourneys.length}</span>
                          </span>
                        </summary>
                        <div className="space-y-2 border-t border-[var(--border-subtle)] px-5 py-4">
                          {startedOtherOpenJourneys.slice(0, 4).map((journey) => {
                            const otherStageState = resolveJourneyNextStage(activeParts, journey)
                            const nextOtherStage = otherStageState?.stage
                            return (
                              <div key={journey.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate font-medium text-slate-800">{journey.label ?? journeyName}</p>
                                    {nextOtherStage && (
                                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Needs action</span>
                                    )}
                                  </div>
                                  <p className="text-slate-600">
                                    {nextOtherStage
                                      ? `${otherStageState.isMissingEarlierStage ? 'Missing' : 'Next'}: ${nextOtherStage.name}`
                                      : 'All stages submitted'}
                                  </p>
                                </div>
                                {nextOtherStage && (
                                  <ButtonLink
                                    href={`/entry/new?studyId=${study.id}&partId=${nextOtherStage.id}&journeyId=${journey.id}`}
                                    tone="secondary"
                                    size="sm"
                                  >
                                    {otherStageState.isMissingEarlierStage ? 'Answer' : 'Continue'}
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
                                  {journey.completedAt ? new Date(journey.completedAt).toLocaleDateString() : 'All stages submitted'}
                                </p>
                              </div>
                              {canViewPastEntries && (
                                <Link
                                  href={`/journey/${journey.id}`}
                                  aria-label={`View ${journey.label ?? journeyName}`}
                                  title={`View ${journey.label ?? journeyName}`}
                                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                                >
                                  <EyeIcon />
                                  <span>View</span>
                                </Link>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null

                    const independentPartCards = independentParts.map((part) => {
                      const pi = study.parts.findIndex((candidate) => candidate.id === part.id)
                      const action = resolveStandardParticipantAction({
                        study,
                        part,
                        partIndex: pi,
                        participation: { joinedAt, consentedAt },
                        today,
                      })
                      const {
                        allowMultipleEntries,
                        canSubmit,
                        currentStatus,
                        entryCount,
                        goalReached,
                        isClosed,
                        isOverdue,
                        pastEntries,
                        target,
                        targetLabel,
                        timeLabel,
                        todayEntries,
                        todayEntry,
                        durationState: dur,
                      } = action

                      return (
                        <div key={part.id} className={`rounded-2xl border p-4 sm:p-5 ${
                          canSubmit ? 'border-indigo-100 bg-indigo-50/50' : 'border-slate-100 bg-white'
                        }`}>
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold text-white px-1.5 py-0.5 rounded-md ${phaseBadgeClass(pi)}`}>
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
                                  {allowMultipleEntries && todayEntries.length > 0 ? 'Add another entry' : 'Answer'}
                                </ButtonLink>
                              ) : todayEntry ? (
                                <ButtonLink href={`/entry/${todayEntry.id}`} tone="secondary" size="md" className="w-full sm:w-auto">
                                  View entry
                                </ButtonLink>
                              ) : null}
                            </div>
                          </div>

                          {((isOverdue || dur?.ended || goalReached || (dur && dur.daysLeft <= 3) || (target || entryCount > 0)) && targetLabel) && (
                            <div className="mt-3">
                              {(isOverdue || dur?.ended) && timeLabel ? (
                                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">{timeLabel}</span>
                              ) : goalReached ? (
                                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">Target reached</span>
                              ) : dur && dur.daysLeft <= 3 && timeLabel ? (
                                <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 ring-1 ring-orange-100">{timeLabel}</span>
                              ) : (target || entryCount > 0) ? (
                                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{targetLabel}</span>
                              ) : null}
                            </div>
                          )}

                          {canViewPastEntries && pastEntries.length > 0 && (
                            <details className="group mt-3">
                              <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]">
                                <ChevronDownIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                                {pastEntries.length} previous {pastEntries.length === 1 ? 'entry' : 'entries'}
                              </summary>
                              <div className="mt-1 overflow-hidden rounded-xl border border-[var(--border-subtle)]">
                                {pastEntries.slice(0, 5).map((entry) => (
                                  <Link key={entry.id} href={`/entry/${entry.id}`}
                                    className="flex items-center justify-between bg-white px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-sunken)]">
                                    <span className="text-slate-600">{entry.date}</span>
                                    <span className="text-xs font-medium text-indigo-600">View →</span>
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
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                          <h3 className="text-xl font-bold text-slate-950">Start {journeyArticle(journeyName)} {journeyName}</h3>
                          <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            diARI will keep the stages together and guide you through what to answer.
                          </p>
                          {stagePreview}
                          <form action={startJourney} className="mt-4">
                            <input type="hidden" name="studyId" value={study.id} />
                            <input type="hidden" name="forceNewJourney" value="true" />
                            <StartJourneyButton className="w-full sm:w-auto">
                              Start {journeyArticle(journeyName)} {journeyName}
                            </StartJourneyButton>
                          </form>
                        </div>
                        {previousJourneyList}
                        {independentPartCards}
                        </>
                      )
                    }

                    const entriesByPart = new Map(openJourney.entries.map((entry) => [entry.partId, entry]))
                    const nextStage = activeParts.find((stage) => !entriesByPart.has(stage.id))
                    const completedCount = activeParts.filter((stage) => entriesByPart.has(stage.id)).length
                    const strictJourneyOrder = study.sequential

                    return (
                      <>
                      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
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
                            const stageAction = resolveJourneyStageParticipantAction({
                              study,
                              stage,
                              activeStages: activeParts,
                              participation: { joinedAt, consentedAt },
                              journey: openJourney,
                              strictOrder: strictJourneyOrder,
                            })
                            const { entry, isClosed, isLocked, isRecommended, isSubmitted } = stageAction

                            if (isSubmitted) {
                              return (
                                <div key={stage.id} className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-white px-4 py-3">
                                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                                    <svg viewBox="0 0 16 16" className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8l3.5 3.5 6.5-7" /></svg>
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-900">{stage.name}</p>
                                    <p className="text-xs text-slate-500">
                                      Submitted{entry?.submittedAt ? ` · ${new Date(String(entry.submittedAt)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                                    </p>
                                  </div>
                                  {canViewPastEntries && entry && (
                                    <Link href={`/entry/${entry.id}`} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-[var(--bg-sunken)]">
                                      View
                                    </Link>
                                  )}
                                </div>
                              )
                            }

                            if (isLocked || isClosed) {
                              return (
                                <div key={stage.id} className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-4 py-3 opacity-60">
                                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white">
                                    {isLocked ? (
                                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="7" width="10" height="8" rx="2" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>
                                    ) : (
                                      <span className="text-xs font-semibold text-slate-400">{index + 1}</span>
                                    )}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-slate-600">{stage.name}</p>
                                    <p className="text-xs text-slate-500">
                                      {isClosed ? 'No longer accepting entries' : `Answer after ${activeParts[index - 1]?.name ?? 'the previous stage'}`}
                                    </p>
                                  </div>
                                </div>
                              )
                            }

                            if (isRecommended) {
                              return (
                                <div key={stage.id} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4">
                                  <div className="flex items-start gap-3">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-bold">
                                      {index + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-bold text-slate-950">{stage.name}</p>
                                      <p className="mt-0.5 text-sm leading-relaxed text-indigo-900/70">
                                        {stage.instructions || 'Answer when this moment applies.'}
                                      </p>
                                    </div>
                                  </div>
                                  <ButtonLink
                                    href={`/entry/new?studyId=${study.id}&partId=${stage.id}&journeyId=${openJourney.id}`}
                                    size="md"
                                    className="mt-3 w-full"
                                  >
                                    Answer
                                  </ButtonLink>
                                </div>
                              )
                            }

                            return (
                              <div key={stage.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-xs font-semibold text-slate-500">
                                  {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-slate-900">{stage.name}</p>
                                  <p className="text-xs text-slate-500">Available if this moment applies</p>
                                </div>
                                <ButtonLink
                                  href={`/entry/new?studyId=${study.id}&partId=${stage.id}&journeyId=${openJourney.id}`}
                                  tone="secondary"
                                  size="sm"
                                  className="shrink-0"
                                >
                                  Answer
                                </ButtonLink>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {completedCount > 0 && nextStage && (
                        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm text-slate-600">Recording a separate {journeyName}?</p>
                            <form action={startJourney} className="shrink-0">
                              <input type="hidden" name="studyId" value={study.id} />
                              <input type="hidden" name="forceNewJourney" value="true" />
                              <StartJourneyButton tone="secondary" size="md">
                                Start new
                              </StartJourneyButton>
                            </form>
                          </div>
                        </div>
                      )}

                      {previousJourneyList}

                      {independentPartCards}
                      </>
                    )
                  })() : study.parts.map((part, pi) => {
                    const canViewPastEntries = study.participantEntryAccess === 'SHOW_READ_ONLY'
                    const action = resolveStandardParticipantAction({
                      study,
                      part,
                      partIndex: pi,
                      participation: { joinedAt, consentedAt },
                      today,
                    })
                    const {
                      allowMultipleEntries,
                      canSubmit,
                      currentStatus,
                      entryCount,
                      goalReached,
                      isClosed,
                      isOverdue,
                      lockedBySequence: isLocked,
                      prevPartName,
                      pastEntries,
                      target,
                      targetLabel,
                      timeLabel,
                      todayEntries,
                      todayEntry,
                      durationState: dur,
                    } = action

                    if (isLocked) {
                      return (
                        <div key={part.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 opacity-75">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`text-xs font-bold text-white px-1.5 py-0.5 rounded-md ${phaseBadgeClass(pi)}`}>
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
                            <span className={`text-xs font-bold text-white px-1.5 py-0.5 rounded-md ${phaseBadgeClass(pi)}`}>
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
                                {allowMultipleEntries && todayEntries.length > 0 ? 'Add another entry' : 'Answer'}
                              </ButtonLink>
                            ) : todayEntry ? (
                              <ButtonLink href={`/entry/${todayEntry.id}`} tone="secondary" size="md" className="w-full sm:w-auto">
                                View entry
                              </ButtonLink>
                            ) : null}
                          </div>
                        </div>

                        {((isOverdue || dur?.ended || goalReached || (dur && dur.daysLeft <= 3) || (target || entryCount > 0)) && targetLabel) && (
                          <div className="mt-3">
                            {(isOverdue || dur?.ended) && timeLabel ? (
                              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">{timeLabel}</span>
                            ) : goalReached ? (
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">Target reached</span>
                            ) : dur && dur.daysLeft <= 3 && timeLabel ? (
                              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 ring-1 ring-orange-100">{timeLabel}</span>
                            ) : (target || entryCount > 0) ? (
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{targetLabel}</span>
                            ) : null}
                          </div>
                        )}

                        {canViewPastEntries && pastEntries.length > 0 && (
                          <details className="group mt-3">
                            <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]">
                              <ChevronDownIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                              {pastEntries.length} previous {pastEntries.length === 1 ? 'entry' : 'entries'}
                            </summary>
                            <div className="mt-1 overflow-hidden rounded-xl border border-[var(--border-subtle)]">
                              {pastEntries.slice(0, 5).map((entry) => (
                                <Link key={entry.id} href={`/entry/${entry.id}`}
                                  className="flex items-center justify-between bg-white px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-sunken)]">
                                  <span className="text-slate-600">{entry.date}</span>
                                  <span className="text-xs font-medium text-indigo-600">View →</span>
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
            )})}
          </div>
        )}
      </main>
    </div>
  )
}
