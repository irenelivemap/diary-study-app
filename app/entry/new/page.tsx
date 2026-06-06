import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import EntryForm from '@/app/components/EntryForm'
import { normalizeTimezone } from '@/app/lib/validation'

function isJourneyStage(part: { flow?: string | null }) {
  return part.flow === 'JOURNEY_STAGE'
}

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
            include: { entries: { where: { userId: session.userId }, select: { date: true } } },
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
    const completedPartIds = new Set(journey.entries.map((entry) => entry.partId))
    const existingStageEntry = journey.entries.find((entry) => entry.partId === partId)
    if (existingStageEntry) redirect(`/entry/${existingStageEntry.id}`)
    const nextPartId = activePartIds.find((candidateId) => !completedPartIds.has(candidateId))
    if (nextPartId !== partId) redirect('/dashboard')
  } else if (journeyId) {
    redirect('/dashboard')
  }

  if (!isJourneyStage(part) && part.entryPolicy === 'ONCE_PER_DAY') {
    const existing = await prisma.entry.findFirst({
      where: { partId, userId: session.userId, date: today },
      orderBy: { submittedAt: 'desc' },
    })
    if (existing) redirect(`/entry/${existing.id}`)
  }

  if (part.dueDate && part.dueDate < new Date()) redirect('/dashboard')
  if (part.durationDays) {
    const end = new Date(participation.joinedAt)
    end.setDate(end.getDate() + part.durationDays)
    if (end < new Date()) redirect('/dashboard')
  }

  // Sequential guard: block access if a previous part has not reached its target entries
  if (part.study.sequential) {
    const thisIndex = part.study.parts.findIndex((p) => p.id === partId)
    const rule = part.unlockRule ?? 'AFTER_PREVIOUS_TARGET'
    const unlocked =
      thisIndex === 0 ||
      rule === 'IMMEDIATE' ||
      (rule === 'MANUAL' && part.isActive) ||
      (rule === 'DATE' && part.unlockAt && new Date(part.unlockAt) <= new Date()) ||
      (rule === 'AFTER_PREVIOUS_TARGET' && part.study.parts.slice(0, thisIndex).every((p) =>
        p.targetEntries != null && p.entries.length >= p.targetEntries
      ))
    if (!unlocked) redirect('/dashboard')
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
