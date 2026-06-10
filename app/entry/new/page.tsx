import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import EntryForm from '@/app/components/EntryForm'
import { normalizeTimezone } from '@/app/lib/validation'
import { canOpenEntryForm, isJourneyStage, resolveJourneyStageEntryState, resolveStandardPartEntryState } from '@/app/lib/entry-state'

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
  })
  if (!participation) redirect('/dashboard')
  if (!participation.consentedAt) redirect('/dashboard')

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { timezone: true } })
  const userTimezone = normalizeTimezone(user?.timezone)
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
          isActive: true,
          isArchived: true,
          sequential: true,
          parts: {
            orderBy: { order: 'asc' },
            include: { entries: { where: { userId: session.userId }, select: { id: true, date: true } } },
          },
          journeys: {
            where: { id: journeyId ?? '__no_journey__', userId: session.userId },
            include: { entries: { select: { id: true, partId: true } } },
          },
        },
      },
    },
  })
  if (!part || !part.isActive || !part.study.isActive || part.study.isArchived) redirect('/dashboard')

  const journey = journeyId ? part.study.journeys[0] : null
  if (isJourneyStage(part)) {
    if (!journey) redirect('/dashboard')
    const activePartIds = part.study.parts.filter((candidate) => candidate.isActive && isJourneyStage(candidate)).map((candidate) => candidate.id)
    const existingStageEntry = journey.entries.find((entry) => entry.partId === partId)
    if (existingStageEntry) redirect(`/entry/${existingStageEntry.id}`)
    const activeStages = part.study.parts.filter((candidate) => activePartIds.includes(candidate.id))
    const entryState = resolveJourneyStageEntryState({
      study: part.study,
      stage: part,
      activeStages,
      participation,
      journeyEntries: journey.entries,
      strictOrder: part.study.sequential,
    })
    if (entryState.state === 'SUBMITTED' && entryState.existingEntryId) redirect(`/entry/${entryState.existingEntryId}`)
    if (!canOpenEntryForm(entryState.state)) redirect('/dashboard')
  } else if (journeyId) {
    redirect('/dashboard')
  }

  if (!isJourneyStage(part)) {
    const currentPart = part.study.parts.find((candidate) => candidate.id === part.id)
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
    <div className="min-h-screen bg-[#F7F8FC]">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors text-sm">←</Link>
            <div>
              <p className="text-xs text-slate-400">
                {isJourneyStage(part) ? `${journey?.label ?? part.study.journeyName ?? 'Journey'} · ${today}` : `${part.study.name} · ${today}`}
              </p>
              <p className="text-sm font-semibold text-slate-900">{part.name}</p>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        {part.instructions && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-1">Instructions</p>
            <p className="text-sm text-indigo-800 leading-relaxed">{part.instructions}</p>
          </div>
        )}
        <EntryForm study={{ id: studyId, partId, journeyId: journey?.id, name: part.name, questions: part.questions }} today={today} />
      </main>
    </div>
  )
}
