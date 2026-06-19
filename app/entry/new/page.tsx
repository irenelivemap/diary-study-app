import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import EntryForm from '@/app/components/EntryForm'
import { normalizeTimezone } from '@/app/lib/validation'
import { canOpenEntryForm, isJourneyStage, resolveJourneyStageEntryState, resolveStandardPartEntryState } from '@/app/lib/entry-state'
import { resolveStudyStatus } from '@/app/lib/study-lifecycle'

export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ studyId?: string; partId?: string; journeyId?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { studyId, partId, journeyId } = await searchParams
  if (!studyId || !partId) redirect('/dashboard')

  const participation = await prisma.studyParticipant.findUnique({
    where: { studyId_userId: { studyId, userId: session.userId } },
    select: {
      consentedAt: true,
      joinedAt: true,
      user: { select: { timezone: true } },
    },
  })
  if (!participation) redirect('/dashboard')
  if (!participation.consentedAt) redirect('/dashboard')

  const userTimezone = normalizeTimezone(participation.user.timezone)
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: userTimezone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const part = await prisma.part.findUnique({
    where: { id: partId },
    include: {
      questions: { orderBy: [{ page: 'asc' }, { order: 'asc' }] },
      study: {
        select: {
          name: true,
          mode: true,
          journeyName: true,
          status: true,
          isActive: true,
          isArchived: true,
          sequential: true,
          parts: {
            orderBy: { order: 'asc' },
            include: { entries: { where: { userId: session.userId }, select: { id: true, date: true, isPilot: true } } },
          },
          journeys: {
            where: { id: journeyId ?? '__no_journey__', userId: session.userId },
            include: { entries: { select: { id: true, partId: true, isPilot: true } } },
          },
        },
      },
    },
  })
  if (!part || !part.isActive || !part.study.isActive || part.study.isArchived) redirect('/dashboard')

  const journey = journeyId ? part.study.journeys[0] : null
  const showPilotEntries = resolveStudyStatus(part.study) === 'PREPARATION'
  const visibleStudyParts = part.study.parts.map((studyPart) => ({
    ...studyPart,
    entries: showPilotEntries ? studyPart.entries : studyPart.entries.filter((entry) => !entry.isPilot),
  }))
  const visibleJourneyEntries = journey
    ? showPilotEntries ? journey.entries : journey.entries.filter((entry) => !entry.isPilot)
    : []

  if (isJourneyStage(part)) {
    if (!journey) redirect('/dashboard')
    if (!showPilotEntries && journey.isPilot) redirect('/dashboard')
    const activePartIds = part.study.parts.filter((candidate) => candidate.isActive && isJourneyStage(candidate)).map((candidate) => candidate.id)
    const existingStageEntry = visibleJourneyEntries.find((entry) => entry.partId === partId)
    if (existingStageEntry) redirect(`/entry/${existingStageEntry.id}`)
    const activeStages = part.study.parts.filter((candidate) => activePartIds.includes(candidate.id))
    const entryState = resolveJourneyStageEntryState({
      study: part.study,
      stage: part,
      activeStages,
      participation,
      journeyEntries: visibleJourneyEntries,
      strictOrder: part.study.sequential,
    })
    if (entryState.state === 'SUBMITTED' && entryState.existingEntryId) redirect(`/entry/${entryState.existingEntryId}`)
    if (!canOpenEntryForm(entryState.state)) redirect('/dashboard')
  } else if (journeyId) {
    redirect('/dashboard')
  }

  if (!isJourneyStage(part)) {
    const currentPart = visibleStudyParts.find((candidate) => candidate.id === part.id)
    const entryState = resolveStandardPartEntryState({
      study: part.study,
      part,
      participation,
      entries: currentPart?.entries ?? [],
      today,
      recommended: true,
    })
    if (entryState.state === 'SUBMITTED' && entryState.existingEntryId) redirect(`/entry/${entryState.existingEntryId}`)
    if (!canOpenEntryForm(entryState.state)) redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <header className="bg-white/90 backdrop-blur-md border-b border-[#E6E3DD] sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13L5 8l5-5" /></svg>
              Back
            </Link>
            <div className="min-w-0 border-l border-[#E6E3DD] pl-3">
              <p className="text-xs text-slate-500 truncate">
                {isJourneyStage(part) ? `${journey?.label ?? part.study.journeyName ?? 'Journey'} · ${today}` : `${part.study.name} · ${today}`}
              </p>
              <p className="text-sm font-semibold text-slate-900 truncate">{part.name}</p>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        {part.instructions && (
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-1.5">Instructions</p>
            <p className="text-sm text-indigo-900/80 leading-relaxed">{part.instructions}</p>
          </div>
        )}
        <EntryForm
          study={{
            id: studyId,
            partId,
            journeyId: journey?.id,
            randomSeed: `${session.userId}:${studyId}:${partId}:${journey?.id ?? 'standard'}:${today}`,
            name: part.name,
            questions: part.questions,
          }}
          today={today}
          timezone={userTimezone ?? undefined}
        />
      </main>
    </div>
  )
}
